using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/reports/{sales,purchase,gst,profit,payment,expense}/route.ts.
[ApiController]
[Route("api/reports")]
[RequirePermission("REPORTS", "VIEW")]
public class ReportsController(SqlConnectionFactory connectionFactory) : ControllerBase
{
    private record SalesSummaryRow(int TotalInvoices, decimal TotalSales, decimal TotalDiscount, decimal TaxableAmount, decimal TotalGst, decimal TotalPaid, decimal TotalDue);
    private record SalesRowDto(int Id, string InvoiceNumber, DateTime InvoiceDate, int? CustomerId, string? CustomerName, decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string PaymentMethod, string Status, string? CancelReason, int CreatedById, DateTime CreatedAt);

    [HttpGet("sales")]
    public async Task<IActionResult> Sales([FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] int? customerId, [FromQuery] string? paymentStatus)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Sales",
            new { From = f, To = t, CustomerId = customerId, PaymentStatus = NullIfBlank(paymentStatus) },
            commandType: CommandType.StoredProcedure);
        var summary = await multi.ReadSingleAsync<SalesSummaryRow>();
        var rows = (await multi.ReadAsync<SalesRowDto>()).ToList();
        var topItems = (await multi.ReadAsync<TopItemRow>()).ToList();

        return Ok(new
        {
            summary = new
            {
                totalInvoices = summary.TotalInvoices, totalSales = summary.TotalSales, totalDiscount = summary.TotalDiscount,
                taxableAmount = summary.TaxableAmount, totalGst = summary.TotalGst, totalPaid = summary.TotalPaid, totalDue = summary.TotalDue,
            },
            rows = rows.Select(r => new
            {
                id = r.Id, invoiceNumber = r.InvoiceNumber, invoiceDate = r.InvoiceDate, customerId = r.CustomerId,
                customer = r.CustomerId is null ? null : new { name = r.CustomerName },
                subtotal = r.Subtotal, discount = r.Discount, taxableAmount = r.TaxableAmount, cgst = r.Cgst, sgst = r.Sgst, igst = r.Igst,
                grandTotal = r.GrandTotal, paidAmount = r.PaidAmount, dueAmount = r.DueAmount, paymentStatus = r.PaymentStatus,
                paymentMethod = r.PaymentMethod, status = r.Status, cancelReason = r.CancelReason, createdById = r.CreatedById, createdAt = r.CreatedAt,
            }),
            topItems = topItems.Select(ToTopItemJson),
        });
    }

    private record PurchaseSummaryRow(int TotalPurchases, decimal TotalAmount, decimal TaxableAmount, decimal TotalGst, decimal TotalDiscount, decimal TotalPaid, decimal TotalDue);
    private record PurchaseRowDto(int Id, string PurchaseNumber, string? SupplierInvoiceNumber, DateTime PurchaseDate, int SupplierId, string SupplierName, decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string PaymentMethod, string Status, int CreatedById, DateTime CreatedAt);

    [HttpGet("purchase")]
    public async Task<IActionResult> Purchase([FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] int? supplierId, [FromQuery] string? paymentStatus)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Purchase",
            new { From = f, To = t, SupplierId = supplierId, PaymentStatus = NullIfBlank(paymentStatus) },
            commandType: CommandType.StoredProcedure);
        var summary = await multi.ReadSingleAsync<PurchaseSummaryRow>();
        var rows = (await multi.ReadAsync<PurchaseRowDto>()).ToList();
        var topSuppliers = (await multi.ReadAsync<TopItemRow>()).ToList();

        return Ok(new
        {
            summary = new
            {
                totalPurchases = summary.TotalPurchases, totalAmount = summary.TotalAmount, taxableAmount = summary.TaxableAmount,
                totalGst = summary.TotalGst, totalDiscount = summary.TotalDiscount, totalPaid = summary.TotalPaid, totalDue = summary.TotalDue,
            },
            rows = rows.Select(r => new
            {
                id = r.Id, purchaseNumber = r.PurchaseNumber, supplierInvoiceNumber = r.SupplierInvoiceNumber, purchaseDate = r.PurchaseDate,
                supplierId = r.SupplierId, supplier = new { name = r.SupplierName },
                subtotal = r.Subtotal, discount = r.Discount, taxableAmount = r.TaxableAmount, cgst = r.Cgst, sgst = r.Sgst, igst = r.Igst,
                grandTotal = r.GrandTotal, paidAmount = r.PaidAmount, dueAmount = r.DueAmount, paymentStatus = r.PaymentStatus,
                paymentMethod = r.PaymentMethod, status = r.Status, createdById = r.CreatedById, createdAt = r.CreatedAt,
            }),
            topSuppliers = topSuppliers.Select(ToTopItemJson),
        });
    }

    private record GstSummaryRow(decimal TaxableValue, decimal Cgst, decimal Sgst, decimal Igst, decimal TotalGst);
    private record GstRowDto(int Id, string InvoiceNumber, DateTime InvoiceDate, int? CustomerId, string? CustomerName, string? CustomerGstin, decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string PaymentMethod, string Status, int CreatedById, DateTime CreatedAt);

    [HttpGet("gst")]
    public async Task<IActionResult> Gst([FromQuery] string? from, [FromQuery] string? to, [FromQuery] int? customerId)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Gst",
            new { From = f, To = t, CustomerId = customerId }, commandType: CommandType.StoredProcedure);
        var summary = await multi.ReadSingleAsync<GstSummaryRow>();
        var rows = (await multi.ReadAsync<GstRowDto>()).ToList();
        var byRate = (await multi.ReadAsync<GstRateRow>()).ToList();

        return Ok(new
        {
            summary = new { taxableValue = summary.TaxableValue, cgst = summary.Cgst, sgst = summary.Sgst, igst = summary.Igst, totalGst = summary.TotalGst },
            rows = rows.Select(r => new
            {
                id = r.Id, invoiceNumber = r.InvoiceNumber, invoiceDate = r.InvoiceDate, customerId = r.CustomerId,
                customer = r.CustomerId is null ? null : new { name = r.CustomerName, gstin = r.CustomerGstin },
                subtotal = r.Subtotal, discount = r.Discount, taxableAmount = r.TaxableAmount, cgst = r.Cgst, sgst = r.Sgst, igst = r.Igst,
                grandTotal = r.GrandTotal, paidAmount = r.PaidAmount, dueAmount = r.DueAmount, paymentStatus = r.PaymentStatus,
                paymentMethod = r.PaymentMethod, status = r.Status, createdById = r.CreatedById, createdAt = r.CreatedAt,
            }),
            byRate = byRate.Select(b => new { gstRate = b.GstRate, taxableValue = b.TaxableValue, gstAmount = b.GstAmount }),
        });
    }

    private record ProfitSummaryRow(decimal GrossSales, decimal Cost, decimal GrossProfit, decimal Expenses, decimal NetProfit, decimal ProfitPercent);

    [HttpGet("profit")]
    public async Task<IActionResult> Profit([FromQuery] string? from, [FromQuery] string? to)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync(
            "dbo.sp_Report_Profit", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
        var summary = await multi.ReadSingleAsync<ProfitSummaryRow>();
        var items = (await multi.ReadAsync<ProfitItemRow>()).ToList();

        return Ok(new
        {
            summary = new
            {
                grossSales = summary.GrossSales, cost = summary.Cost, grossProfit = summary.GrossProfit,
                expenses = summary.Expenses, netProfit = summary.NetProfit, profitPercent = summary.ProfitPercent,
            },
            items = items.Select(i => new
            {
                productId = i.ProductId, name = i.Name, quantity = i.Quantity, salesAmount = i.SalesAmount,
                costAmount = i.CostAmount, profit = i.Profit,
            }),
        });
    }

    private record PaymentTotalsRow(decimal TotalReceived, decimal TotalPaid);
    private record ByMethodRow(string Method, decimal Amount);
    private record PaymentRowDto(int Id, string PaymentNumber, string Direction, DateTime Date, decimal Amount, string Method, string? ReferenceNo, string? Notes, int? CustomerId, string? CustomerName, int? SupplierId, string? SupplierName, int? SaleId, string? SaleInvoiceNumber, int? PurchaseId, string? PurchaseNumber, int CreatedById, DateTime CreatedAt);

    [HttpGet("payment")]
    public async Task<IActionResult> Payment([FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] string? direction, [FromQuery] string? method)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Payment",
            new { From = f, To = t, Direction = NullIfBlank(direction), Method = NullIfBlank(method) },
            commandType: CommandType.StoredProcedure);
        var totals = await multi.ReadSingleAsync<PaymentTotalsRow>();
        var byMethod = (await multi.ReadAsync<ByMethodRow>()).ToList();
        var rows = (await multi.ReadAsync<PaymentRowDto>()).ToList();

        return Ok(new
        {
            summary = new
            {
                totalReceived = totals.TotalReceived, totalPaid = totals.TotalPaid,
                byMethod = byMethod.Select(m => new { method = m.Method, amount = m.Amount }),
            },
            rows = rows.Select(r => new
            {
                id = r.Id, paymentNumber = r.PaymentNumber, direction = r.Direction, date = r.Date, amount = r.Amount,
                method = r.Method, referenceNo = r.ReferenceNo, notes = r.Notes,
                customerId = r.CustomerId, customer = r.CustomerId is null ? null : new { name = r.CustomerName },
                supplierId = r.SupplierId, supplier = r.SupplierId is null ? null : new { name = r.SupplierName },
                saleId = r.SaleId, sale = r.SaleId is null ? null : new { invoiceNumber = r.SaleInvoiceNumber },
                purchaseId = r.PurchaseId, purchase = r.PurchaseId is null ? null : new { purchaseNumber = r.PurchaseNumber },
                createdById = r.CreatedById, createdAt = r.CreatedAt,
            }),
        });
    }

    private record ExpenseTotalRow(decimal TotalExpenses);
    private record ByCategoryRow(string Category, decimal Amount);
    private record ExpenseRowDto(int Id, int CategoryId, string CategoryName, decimal Amount, DateTime Date, string PaymentMethod, string? Description, string? Attachment, int CreatedById, DateTime CreatedAt);

    [HttpGet("expense")]
    public async Task<IActionResult> Expense([FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] int? categoryId, [FromQuery] string? paymentMethod)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_Expense",
            new { From = f, To = t, CategoryId = categoryId, PaymentMethod = NullIfBlank(paymentMethod) },
            commandType: CommandType.StoredProcedure);
        var total = await multi.ReadSingleAsync<ExpenseTotalRow>();
        var byCategory = (await multi.ReadAsync<ByCategoryRow>()).ToList();
        var rows = (await multi.ReadAsync<ExpenseRowDto>()).ToList();

        return Ok(new
        {
            summary = new
            {
                totalExpenses = total.TotalExpenses,
                byCategory = byCategory.Select(c => new { category = c.Category, amount = c.Amount }),
            },
            rows = rows.Select(r => new
            {
                id = r.Id, categoryId = r.CategoryId, category = new { name = r.CategoryName },
                amount = r.Amount, date = r.Date, paymentMethod = r.PaymentMethod, description = r.Description,
                attachment = r.Attachment, createdById = r.CreatedById, createdAt = r.CreatedAt,
            }),
        });
    }

    private record TrendRow(DateTime Period, decimal Sales, decimal Purchases, decimal Expenses, decimal Received, decimal Paid, decimal Cogs, decimal NetProfit);

    // Period-bucketed totals for charts. groupBy = "day" | "month" (default month).
    [HttpGet("trend")]
    public async Task<IActionResult> Trend([FromQuery] string? from, [FromQuery] string? to, [FromQuery] string? groupBy)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        var bucket = string.Equals(groupBy, "day", StringComparison.OrdinalIgnoreCase) ? "DAY" : "MONTH";
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<TrendRow>(
            "dbo.sp_Report_Trend", new { From = f, To = t, GroupBy = bucket }, commandType: CommandType.StoredProcedure);

        return Ok(rows.Select(r => new
        {
            period = r.Period.ToString("yyyy-MM-dd"), sales = r.Sales, purchases = r.Purchases, expenses = r.Expenses,
            received = r.Received, paid = r.Paid, cogs = r.Cogs, netProfit = r.NetProfit,
        }));
    }

    private record DayBookRow(DateTime TxnDate, string TxnType, int RefId, string RefNumber, string? PartyName, string Description, decimal Total, decimal MoneyIn, decimal MoneyOut);
    private record DayBookSummaryRow(decimal MoneyIn, decimal MoneyOut, decimal SalesTotal, decimal PurchaseTotal, decimal ExpenseTotal);

    [HttpGet("day-book")]
    public async Task<IActionResult> DayBook([FromQuery] string? from, [FromQuery] string? to)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_DayBook", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
        var rows = (await multi.ReadAsync<DayBookRow>()).ToList();
        var s = await multi.ReadSingleAsync<DayBookSummaryRow>();

        return Ok(new
        {
            summary = new { moneyIn = s.MoneyIn, moneyOut = s.MoneyOut, net = s.MoneyIn - s.MoneyOut, salesTotal = s.SalesTotal, purchaseTotal = s.PurchaseTotal, expenseTotal = s.ExpenseTotal },
            rows = rows.Select((r, i) => new
            {
                key = $"{r.TxnType}-{r.RefId}-{i}", date = r.TxnDate, type = r.TxnType, refId = r.RefId, refNumber = r.RefNumber,
                partyName = r.PartyName, description = r.Description, total = r.Total, moneyIn = r.MoneyIn, moneyOut = r.MoneyOut,
            }),
        });
    }

    private record BalanceSheetRow(decimal Cash, decimal Bank, decimal Receivables, decimal CustomerOpening, decimal StockValue,
        decimal Payables, decimal SupplierOpening, decimal OutputGst, decimal InputGst, decimal NetProfit);
    private record AccountBalanceRow(string Name, string Kind, decimal Balance);

    // Simplified statement as of today; owner's capital is the balancing figure (see the SP).
    [HttpGet("balance-sheet")]
    public async Task<IActionResult> BalanceSheet()
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Report_BalanceSheet", commandType: CommandType.StoredProcedure);
        var b = await multi.ReadSingleAsync<BalanceSheetRow>();
        var accounts = (await multi.ReadAsync<AccountBalanceRow>()).ToList();

        var netGst = b.OutputGst - b.InputGst;
        var receivables = b.Receivables + b.CustomerOpening;
        var payables = b.Payables + b.SupplierOpening;

        var assets = new List<object>
        {
            new { label = "Cash in Hand", amount = b.Cash },
            new { label = "Bank Balance", amount = b.Bank },
            new { label = "Accounts Receivable (Debtors)", amount = receivables },
            new { label = "Closing Stock (at purchase price)", amount = b.StockValue },
        };
        var liabilities = new List<object>
        {
            new { label = "Accounts Payable (Creditors)", amount = payables },
        };
        decimal totalAssets = b.Cash + b.Bank + receivables + b.StockValue;
        decimal totalLiabilities = payables;
        // Net GST: output > input is owed to the government; input > output is an input-tax-credit asset.
        if (netGst >= 0) { liabilities.Add(new { label = "GST Payable (output - input)", amount = netGst }); totalLiabilities += netGst; }
        else { assets.Add(new { label = "GST Input Credit (input - output)", amount = -netGst }); totalAssets += -netGst; }

        var capital = totalAssets - totalLiabilities - b.NetProfit;

        return Ok(new
        {
            asOf = DateTime.Now,
            assets, totalAssets,
            liabilities, totalLiabilities,
            equity = new object[]
            {
                new { label = "Owner's Capital & Reserves (balancing figure)", amount = capital },
                new { label = "Net Profit (to date)", amount = b.NetProfit },
            },
            totalEquity = capital + b.NetProfit,
            accounts = accounts.Select(a => new { name = a.Name, kind = a.Kind, balance = a.Balance }),
        });
    }

    private record TopItemRow(string Name, decimal Quantity, decimal Amount);
    private record GstRateRow(decimal GstRate, decimal TaxableValue, decimal GstAmount);
    private record ProfitItemRow(int ProductId, string Name, decimal Quantity, decimal SalesAmount, decimal CostAmount, decimal Profit);

    private static object ToTopItemJson(TopItemRow r) => new { name = r.Name, quantity = r.Quantity, amount = r.Amount };

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
