using System.Data;
using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

public record AskIntent(string Intent, DateTime From, DateTime To, string PeriodLabel, int Limit);

public record AskResult(
    string Answer, string Intent, string PeriodLabel, DateTime From, DateTime To, string Engine,
    List<string> Columns, List<List<object?>> Rows, List<(string Label, decimal Value)> Chart, string? Link);

// "Ask your data" — natural-language questions answered from the app's own reports.
// SAFETY: the language model never writes SQL and never sees the database. It only picks one of a
// fixed set of read-only report intents + a date range; the numbers always come from our stored
// procedures. With no local model running, a rule-based parser (English / Hindi / Hinglish) is used.
// The model runs locally via Ollama (free, private — data never leaves the machine).
// TODO: optional free API tier as alternative
public partial class AskService(SqlConnectionFactory connectionFactory, IConfiguration config, IHttpClientFactory httpFactory, ILogger<AskService> logger)
{
    public static readonly Dictionary<string, string> Intents = new()
    {
        ["SALES"] = "total sales, number of invoices, received and due for a period",
        ["PURCHASE"] = "total purchases from suppliers for a period",
        ["PROFIT"] = "profit and loss (gross / net profit, margin) for a period",
        ["EXPENSES"] = "expenses for a period, by category",
        ["TOP_PRODUCTS"] = "best-selling products for a period",
        ["TOP_CUSTOMERS"] = "biggest customers by sales for a period",
        ["RECEIVABLES"] = "customers who owe money (outstanding dues), right now",
        ["PAYABLES"] = "suppliers we owe money to, right now",
        ["LOW_STOCK"] = "products at or below minimum stock, right now",
        ["GST"] = "GST collected (CGST / SGST / IGST) for a period",
        ["CASH_BANK"] = "cash in hand and bank balances, right now",
        ["TREND"] = "month-by-month sales, purchases and profit",
    };

    private string OllamaUrl => (config["Ai:OllamaUrl"] ?? "http://localhost:11434").TrimEnd('/');
    private string Model => config["Ai:Model"] ?? "llama3.1";
    private bool AiEnabled => config.GetValue("Ai:Enabled", true);

    public async Task<bool> IsModelAvailableAsync()
    {
        if (!AiEnabled) return false;
        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(2);
            var tags = await client.GetFromJsonAsync<JsonElement>($"{OllamaUrl}/api/tags");
            return tags.TryGetProperty("models", out var models)
                   && models.EnumerateArray().Any(m => (m.GetProperty("name").GetString() ?? "").StartsWith(Model, StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return false;
        }
    }

    public async Task<AskResult> AskAsync(string question)
    {
        question = question.Trim();
        var hindi = LooksHindi(question);
        var useModel = await IsModelAvailableAsync();

        var intent = useModel ? await ModelIntentAsync(question) ?? RuleIntent(question) : RuleIntent(question);
        var result = await ExecuteAsync(intent, hindi);

        if (useModel)
        {
            var narrated = await ModelNarrateAsync(question, result, hindi);
            if (!string.IsNullOrWhiteSpace(narrated)) result = result with { Answer = narrated, Engine = $"ollama:{Model}" };
            else result = result with { Engine = $"ollama:{Model}" };
        }
        return result;
    }

    // ---------------- rule-based understanding ----------------

    [GeneratedRegex(@"\p{IsDevanagari}")]
    private static partial Regex DevanagariRegex();

    private static bool LooksHindi(string q) =>
        DevanagariRegex().IsMatch(q) ||
        Regex.IsMatch(q, @"\b(kitna|kitni|kitne|kya|kaun|kaunsa|hai|hua|hui|mahine|mahina|saal|aaj|kal|hafte|bikri|munafa|kharch|baki|baaki|udhar|dikhao|batao)\b", RegexOptions.IgnoreCase);

    private static bool Has(string q, params string[] words) => words.Any(w => q.Contains(w, StringComparison.OrdinalIgnoreCase));

    public static AskIntent RuleIntent(string question)
    {
        var q = question.ToLowerInvariant();
        var limit = 10;
        var m = Regex.Match(q, @"\btop\s*(\d{1,2})\b");
        if (m.Success) limit = Math.Clamp(int.Parse(m.Groups[1].Value), 1, 50);

        string intent =
            Has(q, "low stock", "out of stock", "stock kam", "stock khatam", "khatam", "कम स्टॉक", "स्टॉक कम", "reorder") ? "LOW_STOCK" :
            Has(q, "cash", "bank", "balance", "kitna paisa", "नकद", "बैंक") && !Has(q, "sale", "bikri") ? "CASH_BANK" :
            Has(q, "payable", "supplier due", "supplier ko", "dena hai", "dena baki", "देना") ? "PAYABLES" :
            Has(q, "due", "baki", "baaki", "udhar", "outstanding", "receivable", "lena hai", "बकाया", "उधार", "बाकी") ? "RECEIVABLES" :
            Has(q, "profit", "munafa", "fayda", "faayda", "margin", "loss", "nuksan", "मुनाफा", "लाभ", "नुकसान", "p&l") ? "PROFIT" :
            Has(q, "expense", "kharch", "kharcha", "खर्च") ? "EXPENSES" :
            Has(q, "gst", "tax", "cgst", "sgst", "igst", "जीएसटी", "टैक्स") ? "GST" :
            Regex.IsMatch(q, @"\b(top|best|biggest)\s*\d*\s*(customers?|grahak|clients?)\b") ||
            Has(q, "top customer", "best customer", "biggest customer", "sabse bada grahak", "sabse bade grahak", "top grahak", "ग्राहक") ? "TOP_CUSTOMERS" :
            Regex.IsMatch(q, @"\b(top|best)\s*\d*\s*(products?|items?|selling)\b") ||
            Has(q, "top product", "best selling", "best-selling", "most sold", "sabse jyada bik", "sabse zyada bik", "top item", "सबसे ज्यादा", "प्रोडक्ट") ? "TOP_PRODUCTS" :
            Has(q, "purchase", "kharid", "khareed", "खरीद") ? "PURCHASE" :
            Has(q, "trend", "month wise", "monthly", "mahine wise", "har mahine", "महीने") ? "TREND" :
            "SALES";

        var (from, to, label) = ParsePeriod(q, intent == "TREND");
        return new AskIntent(intent, from, to, label, limit);
    }

    private static readonly string[] MonthNames = CultureInfo.InvariantCulture.DateTimeFormat.MonthNames;

    public static (DateTime From, DateTime To, string Label) ParsePeriod(string q, bool longDefault = false)
    {
        var today = DateTime.Today;
        var end = today.AddDays(1).AddTicks(-1);
        DateTime Fy(int offset)
        {
            var startYear = today.Month >= 4 ? today.Year : today.Year - 1;
            return new DateTime(startYear + offset, 4, 1);
        }

        var lastN = Regex.Match(q, @"(?:last|pichhle|pichle|पिछले)\s*(\d{1,3})\s*(?:days|din|दिन)");
        if (lastN.Success)
        {
            var n = Math.Clamp(int.Parse(lastN.Groups[1].Value), 1, 366);
            return (today.AddDays(-(n - 1)), end, $"last {n} days");
        }
        if (Has(q, "yesterday", "kal ", "kal ki", "kal ka", "बीते कल")) return (today.AddDays(-1), today.AddTicks(-1), "yesterday");
        if (Has(q, "today", "aaj", "आज")) return (today, end, "today");
        if (Has(q, "last week", "pichhle hafte", "pichle hafte", "पिछले हफ्ते"))
        {
            var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
            return (monday.AddDays(-7), monday.AddTicks(-1), "last week");
        }
        if (Has(q, "this week", "is hafte", "इस हफ्ते")) return (today.AddDays(-(((int)today.DayOfWeek + 6) % 7)), end, "this week");
        if (Has(q, "last month", "pichhle mahine", "pichle mahine", "पिछले महीने"))
        {
            var first = new DateTime(today.Year, today.Month, 1);
            return (first.AddMonths(-1), first.AddTicks(-1), "last month");
        }
        if (Has(q, "last financial year", "last fy", "pichhle financial")) return (Fy(-1), Fy(0).AddTicks(-1), "last financial year");
        if (Has(q, "financial year", " fy", "vitt varsh")) return (Fy(0), end, "this financial year");
        if (Has(q, "last year", "pichhle saal", "pichle saal", "पिछले साल")) return (new DateTime(today.Year - 1, 1, 1), new DateTime(today.Year, 1, 1).AddTicks(-1), "last year");
        if (Has(q, "this year", "is saal", "इस साल")) return (new DateTime(today.Year, 1, 1), end, "this year");

        for (var i = 0; i < 12; i++)
        {
            var full = MonthNames[i].ToLowerInvariant();
            if (Regex.IsMatch(q, $@"\b({full}|{full[..3]})\b"))
            {
                var year = today.Year;
                var y = Regex.Match(q, @"\b(20\d{2})\b");
                if (y.Success) year = int.Parse(y.Groups[1].Value);
                else if (i + 1 > today.Month) year--; // "march" asked in October → the most recent March
                var first = new DateTime(year, i + 1, 1);
                return (first, first.AddMonths(1).AddTicks(-1), first.ToString("MMMM yyyy", CultureInfo.InvariantCulture));
            }
        }
        if (longDefault) return (new DateTime(today.Year, today.Month, 1).AddMonths(-11), end, "last 12 months");
        return (new DateTime(today.Year, today.Month, 1), end, "this month");
    }

    // ---------------- local model (Ollama) ----------------

    private async Task<string?> ChatAsync(string system, string user, bool json, int timeoutSeconds)
    {
        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
            var response = await client.PostAsJsonAsync($"{OllamaUrl}/api/chat", new
            {
                model = Model,
                stream = false,
                format = json ? "json" : null,
                options = new { temperature = 0 },
                messages = new object[] { new { role = "system", content = system }, new { role = "user", content = user } },
            });
            if (!response.IsSuccessStatusCode) return null;
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            return body.GetProperty("message").GetProperty("content").GetString();
        }
        catch (Exception ex)
        {
            logger.LogWarning("Ollama call failed: {Message}", ex.Message);
            return null;
        }
    }

    private async Task<AskIntent?> ModelIntentAsync(string question)
    {
        var system =
            "You classify a shop owner's question about their billing data. Reply ONLY with JSON: " +
            "{\"intent\": one of [" + string.Join(", ", Intents.Keys) + "], \"period\": a short English phrase like \"this month\", \"last month\", \"today\", \"last 7 days\", \"March 2026\", \"this financial year\", \"last 12 months\", \"limit\": number}. " +
            "Intents: " + string.Join("; ", Intents.Select(kv => $"{kv.Key} = {kv.Value}")) +
            $". Today is {DateTime.Today:yyyy-MM-dd}. The question may be in English, Hindi or Hinglish.";
        var raw = await ChatAsync(system, question, json: true, timeoutSeconds: 60);
        if (raw is null) return null;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var intent = root.TryGetProperty("intent", out var i) ? i.GetString()?.Trim().ToUpperInvariant() : null;
            if (intent is null || !Intents.ContainsKey(intent)) return null;
            var period = root.TryGetProperty("period", out var p) ? p.GetString() ?? "" : "";
            var limit = root.TryGetProperty("limit", out var l) && l.ValueKind == JsonValueKind.Number ? Math.Clamp(l.GetInt32(), 1, 50) : 10;
            // The model's period phrase goes through the same deterministic date parser — it never sets dates directly.
            var (from, to, label) = ParsePeriod(period.ToLowerInvariant(), intent == "TREND");
            return new AskIntent(intent, from, to, label, limit);
        }
        catch
        {
            return null;
        }
    }

    private async Task<string?> ModelNarrateAsync(string question, AskResult result, bool hindi)
    {
        var table = string.Join("\n", result.Rows.Take(15).Select(r => string.Join(" | ", r)));
        var system =
            "You are a helpful assistant for an Indian shop owner. Answer their question in 2-4 short sentences using ONLY the numbers given. " +
            "Never invent numbers. Format money in Indian style with ₹. " + (hindi ? "Reply in simple Hinglish (Hindi in Latin script)." : "Reply in English.");
        var user = $"Question: {question}\nPeriod: {result.PeriodLabel}\nFacts: {result.Answer}\nTable ({string.Join(" | ", result.Columns)}):\n{table}";
        return await ChatAsync(system, user, json: false, timeoutSeconds: 90);
    }

    // ---------------- execution (read-only stored procedures) ----------------

    private static string Inr(decimal v) => "₹" + v.ToString("#,##,##0.##", CultureInfo.GetCultureInfo("en-IN"));

    private class TopItem { public string Name { get; set; } = ""; public decimal Quantity { get; set; } public decimal Amount { get; set; } }
    private class SalesSummary { public int TotalInvoices { get; set; } public decimal TotalSales { get; set; } public decimal TotalGst { get; set; } public decimal TotalPaid { get; set; } public decimal TotalDue { get; set; } public decimal TaxableAmount { get; set; } }
    private class SaleRow { public string? CustomerName { get; set; } public decimal GrandTotal { get; set; } public string Status { get; set; } = ""; }

    private static readonly Dictionary<string, string> HinglishLabels = new()
    {
        ["today"] = "aaj", ["yesterday"] = "kal", ["this week"] = "is hafte", ["last week"] = "pichhle hafte",
        ["this month"] = "is mahine", ["last month"] = "pichhle mahine", ["this year"] = "is saal", ["last year"] = "pichhle saal",
        ["this financial year"] = "is financial year", ["last financial year"] = "pichhle financial year", ["last 12 months"] = "pichhle 12 mahine",
    };

    public async Task<AskResult> ExecuteAsync(AskIntent intent, bool hindi)
    {
        using var connection = connectionFactory.Create();
        var (f, t, label) = (intent.From, intent.To, intent.PeriodLabel);
        if (hindi)
        {
            if (HinglishLabels.TryGetValue(label, out var hl)) label = hl;
            else if (label.StartsWith("last ") && label.EndsWith(" days")) label = $"pichhle {label[5..^5]} din";
        }
        var columns = new List<string>();
        var rows = new List<List<object?>>();
        var chart = new List<(string, decimal)>();
        string answer;
        string? link = null;

        switch (intent.Intent)
        {
            case "PURCHASE":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Purchase", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
                var s = await multi.ReadSingleAsync<dynamic>();
                await multi.ReadAsync<dynamic>();
                var top = (await multi.ReadAsync<TopItem>()).ToList();
                columns = ["Supplier", "Bills", "Amount"];
                rows = top.Select(x => new List<object?> { x.Name, x.Quantity, x.Amount }).ToList();
                chart = top.Select(x => (x.Name, x.Amount)).ToList();
                answer = hindi
                    ? $"{label} mein {s.TotalPurchases} purchase bills, kul {Inr((decimal)s.TotalAmount)}. Supplier ko {Inr((decimal)s.TotalPaid)} diya, {Inr((decimal)s.TotalDue)} dena baki hai."
                    : $"{Cap(label)}: {s.TotalPurchases} purchase bills worth {Inr((decimal)s.TotalAmount)}. Paid {Inr((decimal)s.TotalPaid)}, still payable {Inr((decimal)s.TotalDue)}.";
                link = "/reports/purchase";
                break;
            }
            case "PROFIT":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Profit", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
                var s = await multi.ReadSingleAsync<dynamic>();
                var items = (await multi.ReadAsync<dynamic>()).Take(intent.Limit).ToList();
                columns = ["Product", "Qty", "Sales", "Profit"];
                rows = items.Select(x => new List<object?> { (string)x.Name, (decimal)x.Quantity, (decimal)x.SalesAmount, (decimal)x.Profit }).ToList();
                chart = [("Sales (taxable)", (decimal)s.GrossSales), ("Cost of goods", (decimal)s.Cost), ("Expenses", (decimal)s.Expenses), ("Net profit", (decimal)s.NetProfit)];
                answer = hindi
                    ? $"{label} ka net munafa {Inr((decimal)s.NetProfit)} hai ({(decimal)s.ProfitPercent:0.#}% margin). Bikri {Inr((decimal)s.GrossSales)}, maal ki laagat {Inr((decimal)s.Cost)}, kharche {Inr((decimal)s.Expenses)}."
                    : $"{Cap(label)} net profit is {Inr((decimal)s.NetProfit)} ({(decimal)s.ProfitPercent:0.#}% margin) — sales {Inr((decimal)s.GrossSales)}, cost of goods {Inr((decimal)s.Cost)}, expenses {Inr((decimal)s.Expenses)}.";
                link = "/reports/profit";
                break;
            }
            case "EXPENSES":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Expense", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
                var total = (decimal)(await multi.ReadSingleAsync<dynamic>()).TotalExpenses;
                var byCat = (await multi.ReadAsync<dynamic>()).ToList();
                columns = ["Category", "Amount"];
                rows = byCat.Select(x => new List<object?> { (string)x.Category, (decimal)x.Amount }).ToList();
                chart = byCat.Select(x => ((string)x.Category, (decimal)x.Amount)).ToList();
                var topCat = byCat.FirstOrDefault();
                answer = hindi
                    ? $"{label} mein kul kharch {Inr(total)}." + (topCat is null ? "" : $" Sabse zyada {topCat.Category} par: {Inr((decimal)topCat.Amount)}.")
                    : $"{Cap(label)} expenses total {Inr(total)}." + (topCat is null ? "" : $" Biggest category: {topCat.Category} ({Inr((decimal)topCat.Amount)}).");
                link = "/reports/expense";
                break;
            }
            case "TOP_PRODUCTS":
            case "SALES":
            case "TOP_CUSTOMERS":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Sales", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
                var s = await multi.ReadSingleAsync<SalesSummary>();
                var sales = (await multi.ReadAsync<SaleRow>()).ToList();
                var top = (await multi.ReadAsync<TopItem>()).ToList();
                if (intent.Intent == "TOP_CUSTOMERS")
                {
                    var byCustomer = sales.Where(x => x.Status == "CONFIRMED" && x.CustomerName is not null)
                        .GroupBy(x => x.CustomerName ?? "Walk-in")
                        .Select(g => (Name: g.Key, Count: g.Count(), Amount: g.Sum(x => x.GrandTotal)))
                        .OrderByDescending(x => x.Amount).Take(intent.Limit).ToList();
                    columns = ["Customer", "Bills", "Amount"];
                    rows = byCustomer.Select(x => new List<object?> { x.Name, x.Count, x.Amount }).ToList();
                    chart = byCustomer.Select(x => (x.Name, x.Amount)).ToList();
                    var first = byCustomer.FirstOrDefault();
                    answer = first.Name is null
                        ? (hindi ? $"{label} mein koi bikri nahi hui." : $"No sales {label}.")
                        : hindi
                            ? $"{label} mein sabse bade grahak {first.Name} rahe — {first.Count} bill, {Inr(first.Amount)}."
                            : $"Your biggest customer {label} was {first.Name} — {first.Count} bills worth {Inr(first.Amount)}.";
                    link = "/reports/customer";
                }
                else if (intent.Intent == "TOP_PRODUCTS")
                {
                    var items = top.Take(intent.Limit).ToList();
                    columns = ["Product", "Qty sold", "Amount"];
                    rows = items.Select(x => new List<object?> { x.Name, x.Quantity, x.Amount }).ToList();
                    chart = items.Select(x => (x.Name, x.Amount)).ToList();
                    var first = items.FirstOrDefault();
                    answer = first is null
                        ? (hindi ? $"{label} mein koi bikri nahi hui." : $"No sales {label}.")
                        : hindi
                            ? $"{label} mein sabse zyada bikne wala product {first.Name} raha — {first.Quantity:0.##} units, {Inr(first.Amount)}."
                            : $"Best seller {label}: {first.Name} — {first.Quantity:0.##} units, {Inr(first.Amount)}.";
                    link = "/reports/sales";
                }
                else
                {
                    columns = ["Metric", "Value"];
                    rows =
                    [
                        ["Invoices", s.TotalInvoices], ["Total sales", s.TotalSales], ["GST", s.TotalGst],
                        ["Received", s.TotalPaid], ["Due", s.TotalDue],
                    ];
                    chart = top.Take(8).Select(x => (x.Name, x.Amount)).ToList();
                    answer = hindi
                        ? $"{label} ki kul bikri {Inr(s.TotalSales)} hai ({s.TotalInvoices} bill). {Inr(s.TotalPaid)} mil chuka hai, {Inr(s.TotalDue)} baki hai."
                        : $"{Cap(label)} sales are {Inr(s.TotalSales)} across {s.TotalInvoices} invoices. Received {Inr(s.TotalPaid)}, still due {Inr(s.TotalDue)}.";
                    link = "/reports/sales";
                }
                break;
            }
            case "RECEIVABLES":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Reminder_Candidates", new { OlderThanDays = 0 }, commandType: CommandType.StoredProcedure);
                var customers = (await multi.ReadAsync<dynamic>()).ToList();
                var total = customers.Sum(c => (decimal)c.TotalDue);
                var top = customers.Take(intent.Limit).ToList();
                columns = ["Customer", "Bills", "Due", "Oldest (days)"];
                rows = top.Select(c => new List<object?> { (string)c.Name, (int)c.InvoiceCount, (decimal)c.TotalDue, (int)c.OldestDays }).ToList();
                chart = top.Select(c => ((string)c.Name, (decimal)c.TotalDue)).ToList();
                (f, t, label) = (DateTime.Today, DateTime.Today, hindi ? "aaj tak" : "as of today");
                answer = hindi
                    ? $"Abhi {customers.Count} grahakon par kul {Inr(total)} baki hai." + (top.Count > 0 ? $" Sabse zyada {top[0].Name} par: {Inr((decimal)top[0].TotalDue)}." : "")
                    : $"{customers.Count} customers owe you {Inr(total)} in total." + (top.Count > 0 ? $" Largest: {top[0].Name} ({Inr((decimal)top[0].TotalDue)})." : "");
                link = "/payments/reminders";
                break;
            }
            case "PAYABLES":
            {
                var suppliers = (await connection.QueryAsync<dynamic>("dbo.sp_Supplier_List", commandType: CommandType.StoredProcedure))
                    .Select(x => (Name: (string)x.Name, Due: (decimal)(x.Due ?? 0m))).Where(x => x.Due > 0).OrderByDescending(x => x.Due).ToList();
                var total = suppliers.Sum(x => x.Due);
                columns = ["Supplier", "Due"];
                rows = suppliers.Take(intent.Limit).Select(x => new List<object?> { x.Name, x.Due }).ToList();
                chart = suppliers.Take(intent.Limit).Select(x => (x.Name, x.Due)).ToList();
                (f, t, label) = (DateTime.Today, DateTime.Today, hindi ? "aaj tak" : "as of today");
                answer = hindi
                    ? $"Aapko {suppliers.Count} suppliers ko kul {Inr(total)} dena hai."
                    : $"You owe {Inr(total)} to {suppliers.Count} suppliers.";
                link = "/reports/supplier";
                break;
            }
            case "LOW_STOCK":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Alerts_Summary", new { OverdueDays = 30 }, commandType: CommandType.StoredProcedure);
                var items = (await multi.ReadAsync<dynamic>()).ToList();
                columns = ["Product", "In stock", "Minimum"];
                rows = items.Take(intent.Limit * 3).Select(x => new List<object?> { (string)x.Name, (decimal)x.Balance, (decimal)x.MinimumStock }).ToList();
                (f, t, label) = (DateTime.Today, DateTime.Today, hindi ? "abhi" : "right now");
                var outCount = items.Count(x => (decimal)x.Balance <= 0);
                answer = items.Count == 0
                    ? (hindi ? "Sab products ka stock theek hai — koi bhi minimum se neeche nahi." : "All products are above their minimum stock level.")
                    : hindi
                        ? $"{items.Count} products ka stock kam hai ({outCount} bilkul khatam). Jaldi order karein."
                        : $"{items.Count} products are at or below minimum stock ({outCount} out of stock).";
                link = "/inventory/low-stock";
                break;
            }
            case "GST":
            {
                using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Gst", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
                var s = await multi.ReadSingleAsync<dynamic>();
                await multi.ReadAsync<dynamic>();
                var byRate = (await multi.ReadAsync<dynamic>()).ToList();
                columns = ["GST rate", "Taxable", "Tax"];
                rows = byRate.Select(x => new List<object?> { $"{(decimal)x.GstRate:0.##}%", (decimal)x.TaxableValue, (decimal)x.GstAmount }).ToList();
                chart = [("CGST", (decimal)s.Cgst), ("SGST", (decimal)s.Sgst), ("IGST", (decimal)s.Igst)];
                answer = hindi
                    ? $"{label} mein kul GST {Inr((decimal)s.TotalGst)} (CGST {Inr((decimal)s.Cgst)}, SGST {Inr((decimal)s.Sgst)}, IGST {Inr((decimal)s.Igst)}) taxable value {Inr((decimal)s.TaxableValue)} par."
                    : $"{Cap(label)} GST collected: {Inr((decimal)s.TotalGst)} (CGST {Inr((decimal)s.Cgst)}, SGST {Inr((decimal)s.Sgst)}, IGST {Inr((decimal)s.Igst)}) on taxable value {Inr((decimal)s.TaxableValue)}.";
                link = "/reports/gst";
                break;
            }
            case "CASH_BANK":
            {
                var accounts = (await connection.QueryAsync<dynamic>("dbo.sp_MoneyAccount_List", commandType: CommandType.StoredProcedure)).ToList();
                columns = ["Account", "Type", "Balance"];
                rows = accounts.Select(a => new List<object?> { (string)a.Name, (string)a.Kind, (decimal)a.CurrentBalance }).ToList();
                chart = accounts.Select(a => ((string)a.Name, (decimal)a.CurrentBalance)).ToList();
                var cash = accounts.Where(a => (string)a.Kind == "CASH").Sum(a => (decimal)a.CurrentBalance);
                var bank = accounts.Where(a => (string)a.Kind == "BANK").Sum(a => (decimal)a.CurrentBalance);
                (f, t, label) = (DateTime.Today, DateTime.Today, hindi ? "abhi" : "right now");
                answer = hindi
                    ? $"Abhi haath mein cash {Inr(cash)} aur bank mein {Inr(bank)} hai — kul {Inr(cash + bank)}."
                    : $"Cash in hand {Inr(cash)}, bank {Inr(bank)} — {Inr(cash + bank)} in total.";
                link = "/cash-bank";
                break;
            }
            default: // TREND
            {
                var months = (await connection.QueryAsync<dynamic>("dbo.sp_Report_Trend", new { From = f, To = t, GroupBy = "MONTH" }, commandType: CommandType.StoredProcedure)).ToList();
                columns = ["Month", "Sales", "Purchases", "Expenses", "Net profit"];
                rows = months.Select(m => new List<object?> { ((DateTime)m.Period).ToString("MMM yyyy", CultureInfo.InvariantCulture), (decimal)m.Sales, (decimal)m.Purchases, (decimal)m.Expenses, (decimal)m.NetProfit }).ToList();
                chart = months.Select(m => (((DateTime)m.Period).ToString("MMM yy", CultureInfo.InvariantCulture), (decimal)m.Sales)).ToList();
                var best = months.OrderByDescending(m => (decimal)m.Sales).FirstOrDefault();
                answer = best is null
                    ? (hindi ? "Is period mein koi data nahi." : "No data in this period.")
                    : hindi
                        ? $"{label} mein sabse achha mahina {((DateTime)best.Period).ToString("MMMM yyyy", CultureInfo.InvariantCulture)} raha — bikri {Inr((decimal)best.Sales)}."
                        : $"Best month {label}: {((DateTime)best.Period).ToString("MMMM yyyy", CultureInfo.InvariantCulture)} with sales of {Inr((decimal)best.Sales)}.";
                link = "/reports";
                break;
            }
        }

        return new AskResult(answer, intent.Intent, label, f, t, "rules", columns, rows, chart, link);
    }

    private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
}
