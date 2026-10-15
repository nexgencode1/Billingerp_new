using System.Data;
using System.Text.Json;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

public record DemoStatus(bool IsLoaded, bool HasExtras, bool HasExtras2, int Products, int Customers, int Suppliers, int Sales, int Purchases, int Payments, int Expenses);

public record DemoLoadResult(int Products, int Customers, int Suppliers, int Sales, int Purchases, int Payments, int Expenses, int Leads, int Employees, int Documents, int Deposits, int Extras2 = 0);

// Loads a realistic ~6-month demo data set by calling the SAME stored procedures the real
// endpoints use (sp_Product_Create, sp_Sale_Create, sp_Purchase_Create, sp_Payment_Receive, ...),
// so invoice numbering, the stock ledger, GST split and paid/due amounts are all genuine.
// The whole load runs in one transaction — either the full demo set lands or nothing does.
// Demo products are tagged with SKU prefix "DEMO-" (sp_Demo_Status uses that to detect a reload).
// Product GST rates / HSN codes below are illustrative demo values only. // VERIFY: official rule
public class DemoDataService(SqlConnectionFactory connectionFactory, GstConfig gst)
{
    private const int HistoryDays = 180;

    private record ProductSeed(string Name, string Category, string Unit, string Hsn, decimal Purchase, decimal Selling, decimal Mrp, decimal GstRate, decimal Opening, decimal Minimum, int MaxQtyPerSale);
    private record PartySeed(string Name, string Mobile, string City, string State, string? Email);
    private record DemoProduct(int Id, ProductSeed Seed);
    private record PendingSettlement(DateTime Date, int PartyId, int DocumentId, decimal Amount, string Method, bool IsSale);

    private static readonly ProductSeed[] Products =
    [
        new("Samsung Galaxy M14 (4GB/64GB)", "Mobiles & Accessories", "Piece", "8517", 11200, 12999, 14490, 18, 15, 3, 2),
        new("Redmi 13C (6GB/128GB)", "Mobiles & Accessories", "Piece", "8517", 9100, 10499, 11999, 18, 15, 3, 2),
        new("boAt Airdopes 141", "Mobiles & Accessories", "Piece", "8518", 850, 1299, 4490, 18, 40, 8, 3),
        new("Realme 20W Fast Charger", "Mobiles & Accessories", "Piece", "8504", 320, 549, 799, 18, 50, 10, 4),
        new("Type-C Cable 1m", "Mobiles & Accessories", "Piece", "8544", 70, 149, 299, 18, 120, 20, 5),
        new("Tempered Glass Screen Guard", "Mobiles & Accessories", "Piece", "7007", 25, 99, 199, 18, 200, 30, 5),
        new("Mi Power Bank 10000mAh", "Mobiles & Accessories", "Piece", "8507", 900, 1299, 1799, 18, 30, 6, 2),
        new("Philips LED Bulb 9W", "Home Appliances", "Piece", "8539", 65, 99, 140, 12, 150, 25, 6),
        new("Bajaj Ceiling Fan 1200mm", "Home Appliances", "Piece", "8414", 1650, 2199, 2650, 18, 20, 4, 2),
        new("Prestige Pressure Cooker 3L", "Home Appliances", "Piece", "7615", 1150, 1549, 1995, 12, 20, 4, 2),
        new("Havells Electric Kettle 1.5L", "Home Appliances", "Piece", "8516", 780, 1099, 1495, 18, 20, 4, 2),
        new("Usha Steam Iron", "Home Appliances", "Piece", "8516", 900, 1299, 1690, 18, 15, 3, 2),
        new("Aashirvaad Atta 10kg", "Groceries", "Pack", "1101", 410, 465, 499, 5, 60, 10, 3),
        new("India Gate Basmati Rice 5kg", "Groceries", "Pack", "1006", 540, 625, 699, 5, 50, 10, 3),
        new("Fortune Sunflower Oil 1L", "Groceries", "Pack", "1512", 128, 149, 165, 5, 100, 20, 6),
        new("Tata Salt 1kg", "Groceries", "Pack", "2501", 22, 27, 28, 5, 200, 30, 8),
        new("Toor Dal", "Groceries", "Kg", "0713", 125, 155, 170, 5, 150, 25, 5),
        new("Sugar", "Groceries", "Kg", "1701", 39, 46, 50, 5, 300, 40, 8),
        new("Tata Tea Premium 500g", "Groceries", "Pack", "0902", 230, 270, 290, 5, 80, 15, 4),
        new("Amul Butter 500g", "Groceries", "Pack", "0405", 245, 275, 285, 12, 40, 8, 3),
        new("Surf Excel Easy Wash 1kg", "FMCG", "Pack", "3402", 118, 140, 150, 18, 90, 15, 4),
        new("Colgate Strong Teeth 200g", "FMCG", "Pack", "3306", 92, 112, 120, 18, 100, 20, 5),
        new("Dettol Soap (Pack of 4)", "FMCG", "Pack", "3401", 165, 199, 220, 18, 80, 15, 4),
        new("Parle-G Biscuit 800g", "FMCG", "Pack", "1905", 72, 88, 95, 18, 120, 20, 6),
        new("Maggi Noodles (Pack of 12)", "FMCG", "Pack", "1902", 145, 168, 180, 12, 90, 15, 5),
        new("Classmate Notebook 172pg", "Stationery", "Piece", "4820", 38, 55, 65, 12, 200, 30, 10),
        new("Reynolds Ball Pen (Pack of 10)", "Stationery", "Pack", "9608", 55, 80, 100, 18, 120, 20, 5),
        new("JK Copier A4 Paper Ream", "Stationery", "Box", "4802", 235, 290, 320, 12, 60, 10, 4),
        new("Casio FX-82MS Calculator", "Stationery", "Piece", "8470", 520, 695, 795, 18, 25, 5, 2),
        new("Men's Cotton T-Shirt", "Apparel", "Piece", "6109", 210, 399, 599, 5, 80, 15, 4),
        new("Women's Kurti", "Apparel", "Piece", "6204", 380, 699, 999, 5, 60, 10, 3),
        new("Jeans (Denim)", "Apparel", "Piece", "6203", 620, 1099, 1499, 12, 50, 8, 2),
        new("Sports Shoes", "Apparel", "Pair", "6404", 780, 1299, 1999, 12, 40, 6, 2),
        new("Asian Paints Tractor Emulsion 4L", "Hardware", "Piece", "3209", 760, 930, 1050, 18, 30, 5, 3),
        new("Fevicol SH 1kg", "Hardware", "Piece", "3506", 235, 290, 320, 18, 50, 10, 4),
        new("Stanley Screwdriver Set", "Hardware", "Set", "8205", 340, 499, 650, 18, 25, 5, 2),
    ];

    private static readonly PartySeed[] Customers =
    [
        new("Amit Traders", "9000100001", "New Delhi", "Delhi", "amit.traders@example.com"),
        new("Sunita Kumari", "9000100002", "Delhi", "Delhi", null),
        new("Rohit Electronics", "9000100003", "Noida", "Uttar Pradesh", "rohit.elec@example.com"),
        new("Neha Gupta", "9000100004", "Ghaziabad", "Uttar Pradesh", null),
        new("Vikas General Store", "9000100005", "Gurugram", "Haryana", "vikas.store@example.com"),
        new("Pooja Sharma", "9000100006", "Faridabad", "Haryana", null),
        new("Kumar Kirana", "9000100007", "Delhi", "Delhi", null),
        new("Ankit Verma", "9000100008", "Delhi", "Delhi", "ankit.v@example.com"),
        new("Sai Mobile Point", "9000100009", "Jaipur", "Rajasthan", "saimobile@example.com"),
        new("Meera Joshi", "9000100010", "Chandigarh", "Chandigarh", null),
        new("Raj Hardware", "9000100011", "Delhi", "Delhi", "rajhardware@example.com"),
        new("Deepak Singh", "9000100012", "Meerut", "Uttar Pradesh", null),
        new("Fashion Hub", "9000100013", "Lucknow", "Uttar Pradesh", "fashionhub@example.com"),
        new("Kavita Agarwal", "9000100014", "Delhi", "Delhi", null),
        new("Shree Ganesh Stores", "9000100015", "Mumbai", "Maharashtra", "ganesh.stores@example.com"),
        new("Arjun Mehta", "9000100016", "Delhi", "Delhi", null),
        new("Bharat Stationers", "9000100017", "Delhi", "Delhi", "bharat.stat@example.com"),
        new("Ritu Malhotra", "9000100018", "Gurugram", "Haryana", null),
        new("City Supermart", "9000100019", "Dehradun", "Uttarakhand", "citysupermart@example.com"),
        new("Manish Yadav", "9000100020", "Delhi", "Delhi", null),
    ];

    private static readonly PartySeed[] Suppliers =
    [
        new("Metro Mobile Distributors", "9000200001", "Delhi", "Delhi", "orders@metromobile.example.com"),
        new("Gupta Electricals Wholesale", "9000200002", "Delhi", "Delhi", "sales@guptaelec.example.com"),
        new("Annapurna Food Suppliers", "9000200003", "Sonipat", "Haryana", "annapurna@example.com"),
        new("Hindustan FMCG Agency", "9000200004", "Noida", "Uttar Pradesh", "hfa@example.com"),
        new("Vidya Paper Mart", "9000200005", "Delhi", "Delhi", "vidya.paper@example.com"),
        new("Tirupur Garments Co.", "9000200006", "Tiruppur", "Tamil Nadu", "tirupur.garments@example.com"),
        new("Ludhiana Hardware House", "9000200007", "Ludhiana", "Punjab", "lhh@example.com"),
        new("Surat Textiles", "9000200008", "Surat", "Gujarat", "surat.tex@example.com"),
    ];

    // Which supplier restocks which category.
    private static readonly Dictionary<string, string[]> SupplierCategories = new()
    {
        ["Metro Mobile Distributors"] = ["Mobiles & Accessories"],
        ["Gupta Electricals Wholesale"] = ["Home Appliances"],
        ["Annapurna Food Suppliers"] = ["Groceries"],
        ["Hindustan FMCG Agency"] = ["FMCG"],
        ["Vidya Paper Mart"] = ["Stationery"],
        ["Tirupur Garments Co."] = ["Apparel"],
        ["Ludhiana Hardware House"] = ["Hardware"],
        ["Surat Textiles"] = ["Apparel"],
    };

    private static readonly (string Category, decimal Min, decimal Max, int DayOfMonth)[] MonthlyExpenses =
    [
        ("Rent", 25000, 25000, 1),
        ("Salary", 68000, 68000, 1),
        ("Electricity", 3800, 6200, 8),
        ("Internet", 999, 999, 10),
    ];

    private static readonly (string Category, string Description, decimal Min, decimal Max)[] RandomExpenses =
    [
        ("Transport", "Delivery van fuel", 400, 1500),
        ("Transport", "Courier charges", 150, 600),
        ("Office", "Office supplies", 200, 1200),
        ("Office", "Tea & refreshments", 100, 500),
        ("Marketing", "Pamphlet printing", 800, 3000),
        ("Marketing", "Social media promotion", 500, 2500),
        ("Maintenance", "AC servicing", 600, 1800),
        ("Maintenance", "Shop repair work", 500, 4000),
        ("Other", "Miscellaneous", 100, 900),
    ];

    private static readonly (string Name, string Designation, string Department, decimal Salary)[] Employees =
    [
        ("Ramesh Kumar", "Store Manager", "Operations", 28000),
        ("Seema Rani", "Cashier", "Sales", 16000),
        ("Imran Khan", "Sales Executive", "Sales", 15000),
        ("Pinky Devi", "Sales Executive", "Sales", 14000),
        ("Sanjay Pal", "Accountant", "Accounts", 22000),
        ("Mohit Saini", "Delivery Boy", "Logistics", 12000),
    ];

    private static readonly (string Name, string Mobile, string Source, string Status, string Notes)[] Leads =
    [
        ("Green Valley School", "9000300001", "Referral", "PROPOSAL", "Bulk order of notebooks & stationery for new session"),
        ("Hotel Royal Inn", "9000300002", "Walk-in", "QUALIFIED", "Needs 40 LED bulbs + 10 kettles"),
        ("Sharma Caterers", "9000300003", "Phone", "CONTACTED", "Monthly grocery supply enquiry"),
        ("Bright Coaching Centre", "9000300004", "Website", "NEW", "Calculators for students"),
        ("Om Sai Builders", "9000300005", "Referral", "WON", "Paint & hardware for site office"),
        ("Fit Life Gym", "9000300006", "Instagram", "NEW", "Interested in sports shoes for staff"),
        ("Anand Wedding Planners", "9000300007", "Walk-in", "LOST", "Went with another vendor on price"),
        ("Sunrise Hospital Canteen", "9000300008", "Phone", "PROPOSAL", "Tea, sugar & biscuits monthly contract"),
    ];

    private static readonly string[] SaleMethods = ["CASH", "CASH", "UPI", "UPI", "UPI", "CARD"];

    public async Task<DemoStatus> GetStatusAsync()
    {
        using var connection = connectionFactory.Create();
        return await connection.QuerySingleAsync<DemoStatus>("dbo.sp_Demo_Status", commandType: CommandType.StoredProcedure);
    }

    // Loads whichever demo parts are missing: the core history (products -> attendance) and the
    // "extras" (weekly cash->bank deposits, estimates / sale orders / challans). Both in one transaction.
    public async Task<DemoLoadResult> LoadAsync(int userId, bool coreAlreadyLoaded, bool extrasAlreadyLoaded = false)
    {
        using var connection = connectionFactory.Create();
        connection.Open();
        using var tx = connection.BeginTransaction();

        var today = DateTime.Today;
        var startDate = today.AddDays(-HistoryDays);
        var core = coreAlreadyLoaded
            ? new DemoLoadResult(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
            : await LoadCoreAsync(connection, tx, userId, startDate, today);
        var (documents, deposits) = extrasAlreadyLoaded ? (0, 0) : await LoadExtrasAsync(connection, tx, userId, startDate, today);
        var extras2 = await LoadExtras2Async(connection, tx, userId, today);

        tx.Commit();
        return core with { Documents = documents, Deposits = deposits, Extras2 = extras2 };
    }

    private static async Task<DemoLoadResult> LoadCoreAsync(IDbConnection connection, IDbTransaction tx, int userId, DateTime startDate, DateTime today)
    {
        var random = new Random(20260101);

        // ---- Master data ----
        var ctx = new DynamicParameters();
        ctx.Add("CustomerId", null);
        ctx.Add("BusinessState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerExists", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Sale_PrepareContext", ctx, tx, commandType: CommandType.StoredProcedure);
        var businessState = ctx.Get<string?>("BusinessState") ?? "";

        var categoryIds = await EnsureCategoriesAsync(connection, tx, Products.Select(p => p.Category).Distinct());
        var unitIds = await EnsureUnitsAsync(connection, tx, Products.Select(p => p.Unit).Distinct());

        var products = new List<DemoProduct>();
        var stock = new Dictionary<int, decimal>();
        for (var i = 0; i < Products.Length; i++)
        {
            var seed = Products[i];
            var p = new DynamicParameters();
            p.Add("Name", seed.Name);
            p.Add("Sku", $"DEMO-{i + 1:D3}");
            p.Add("Barcode", $"890{random.NextInt64(1_000_000_000L, 9_999_999_999L)}");
            p.Add("CategoryId", categoryIds[seed.Category]);
            p.Add("UnitId", unitIds[seed.Unit]);
            p.Add("HsnCode", seed.Hsn);
            p.Add("PurchasePrice", seed.Purchase);
            p.Add("SellingPrice", seed.Selling);
            p.Add("Mrp", seed.Mrp);
            p.Add("GstRate", seed.GstRate);
            p.Add("OpeningStock", seed.Opening);
            p.Add("MinimumStock", seed.Minimum);
            p.Add("MaximumStock", seed.Opening * 2);
            p.Add("Description", "Demo product");
            p.Add("CreatedById", userId);
            p.Add("ProductId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Product_Create", p, tx, commandType: CommandType.StoredProcedure);
            var id = p.Get<int>("ProductId");
            products.Add(new DemoProduct(id, seed));
            stock[id] = seed.Opening;
        }

        var customers = new List<(int Id, string State)>();
        foreach (var c in Customers)
        {
            var p = new DynamicParameters();
            p.Add("Name", c.Name);
            p.Add("Mobile", c.Mobile);
            p.Add("Email", c.Email);
            p.Add("City", c.City);
            p.Add("State", c.State);
            p.Add("CreditLimit", 50000m);
            p.Add("PaymentTerms", "15 days");
            p.Add("Notes", "Demo customer");
            p.Add("CustomerId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Customer_Create", p, tx, commandType: CommandType.StoredProcedure);
            customers.Add((p.Get<int>("CustomerId"), c.State));
        }

        var suppliers = new List<(int Id, string Name, string State)>();
        foreach (var s in Suppliers)
        {
            var p = new DynamicParameters();
            p.Add("Name", s.Name);
            p.Add("Mobile", s.Mobile);
            p.Add("Email", s.Email);
            p.Add("City", s.City);
            p.Add("State", s.State);
            p.Add("Notes", "Demo supplier");
            p.Add("SupplierId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Supplier_Create", p, tx, commandType: CommandType.StoredProcedure);
            suppliers.Add((p.Get<int>("SupplierId"), s.Name, s.State));
        }

        var expenseCategoryIds = (await connection.QueryAsync<(int Id, string Name)>(
                "dbo.sp_ExpenseCategory_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);

        // ---- Day-by-day transaction history (chronological, so invoice numbers stay in date order) ----
        int saleCount = 0, purchaseCount = 0, paymentCount = 0, expenseCount = 0;
        var pending = new List<PendingSettlement>();

        for (var day = startDate; day <= today; day = day.AddDays(1))
        {
            // Settle earlier credit sales / purchases that fall due today.
            foreach (var settle in pending.Where(x => x.Date.Date == day).ToList())
            {
                if (await SettleAsync(connection, tx, settle, userId)) paymentCount++;
                pending.Remove(settle);
            }

            // Restock: every 4th day, or whenever a product falls to its minimum level.
            var lowStock = products.Where(p => stock[p.Id] <= p.Seed.Minimum).ToList();
            if (lowStock.Count > 0 || (day - startDate).Days % 4 == 0)
            {
                var restockGroups = (lowStock.Count > 0 ? lowStock : products.OrderBy(_ => random.Next()).Take(6).ToList())
                    .GroupBy(p => suppliers.First(s => SupplierCategories[s.Name].Contains(p.Seed.Category)));
                foreach (var group in restockGroups)
                {
                    var purchaseId = await CreatePurchaseAsync(connection, tx, random, day, group.Key, group.ToList(), stock, businessState, userId, pending);
                    if (purchaseId > 0) purchaseCount++;
                }
            }

            // Sales: busier on weekends, quieter on Monday.
            var salesToday = day.DayOfWeek switch
            {
                DayOfWeek.Saturday or DayOfWeek.Sunday => random.Next(5, 9),
                DayOfWeek.Monday => random.Next(2, 4),
                _ => random.Next(3, 7),
            };
            for (var n = 0; n < salesToday; n++)
            {
                var invoiceTime = day.AddHours(10 + random.Next(0, 10)).AddMinutes(random.Next(0, 60));
                if (await CreateSaleAsync(connection, tx, random, invoiceTime, products, customers, stock, businessState, userId, pending, today))
                    saleCount++;
            }

            // Fixed monthly expenses + a few random ones.
            foreach (var (category, min, max, dayOfMonth) in MonthlyExpenses)
            {
                if (day.Day != dayOfMonth) continue;
                await CreateExpenseAsync(connection, tx, expenseCategoryIds, category, $"{category} - {day:MMMM yyyy}", RoundRupees(Between(random, min, max)), day, "BANK", userId);
                expenseCount++;
            }
            if (random.NextDouble() < 0.35)
            {
                var (category, description, min, max) = RandomExpenses[random.Next(RandomExpenses.Length)];
                await CreateExpenseAsync(connection, tx, expenseCategoryIds, category, description, RoundRupees(Between(random, min, max)), day, random.NextDouble() < 0.6 ? "CASH" : "UPI", userId);
                expenseCount++;
            }
        }

        // ---- CRM + HR ----
        foreach (var lead in Leads)
        {
            var p = new DynamicParameters();
            p.Add("Name", lead.Name);
            p.Add("Mobile", lead.Mobile);
            p.Add("Source", lead.Source);
            p.Add("Status", lead.Status);
            p.Add("AssignedToId", userId);
            p.Add("Notes", lead.Notes);
            p.Add("LeadId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Lead_Create", p, tx, commandType: CommandType.StoredProcedure);
        }

        var employeeIds = new List<int>();
        foreach (var e in Employees)
        {
            var p = new DynamicParameters();
            p.Add("Name", e.Name);
            p.Add("Designation", e.Designation);
            p.Add("Department", e.Department);
            p.Add("Mobile", $"90004{random.Next(10000, 99999)}");
            p.Add("JoiningDate", startDate.AddDays(-random.Next(60, 900)));
            p.Add("Salary", e.Salary);
            p.Add("EmployeeId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Employee_Create", p, tx, commandType: CommandType.StoredProcedure);
            employeeIds.Add(p.Get<int>("EmployeeId"));
        }

        // Last 30 days of attendance (Sundays off).
        for (var day = today.AddDays(-29); day <= today; day = day.AddDays(1))
        {
            if (day.DayOfWeek == DayOfWeek.Sunday) continue;
            foreach (var employeeId in employeeIds)
            {
                var roll = random.NextDouble();
                var status = roll < 0.86 ? "PRESENT" : roll < 0.92 ? "HALF_DAY" : roll < 0.96 ? "LEAVE" : "ABSENT";
                var present = status is "PRESENT" or "HALF_DAY";
                await connection.ExecuteAsync("dbo.sp_Attendance_Upsert", new
                {
                    EmployeeId = employeeId,
                    Date = day,
                    Status = status,
                    CheckIn = present ? $"09:{random.Next(30, 59):D2}" : null,
                    CheckOut = present ? (status == "HALF_DAY" ? "14:00" : $"19:{random.Next(0, 30):D2}") : null,
                    Note = (string?)null,
                }, tx, commandType: CommandType.StoredProcedure);
            }
        }

        return new DemoLoadResult(products.Count, customers.Count, suppliers.Count, saleCount, purchaseCount, paymentCount, expenseCount, Leads.Length, Employees.Length, 0, 0);
    }

    private class ProductLookupRow
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Sku { get; set; } = "";
        public decimal SellingPrice { get; set; }
        public decimal GstRate { get; set; }
    }

    private class CustomerLookupRow
    {
        public int Id { get; set; }
        public string? State { get; set; }
        public string? Notes { get; set; }
    }

    private class AccountLookupRow
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Kind { get; set; } = "";
        public string? BankName { get; set; }
        public string? AccountNumber { get; set; }
        public string? Ifsc { get; set; }
        public decimal OpeningBalance { get; set; }
        public bool IsDefault { get; set; }
        public bool Status { get; set; }
    }

    private const decimal DemoBankOpeningBalance = 300000m;

    private record LedgerSummary(decimal OpeningBalance, decimal TotalIn, decimal TotalOut, decimal ClosingBalance);

    private static readonly (string DocType, int Count)[] DemoDocuments = [("ESTIMATE", 7), ("SALE_ORDER", 5), ("DELIVERY_CHALLAN", 3)];

    // Weekly (Saturday) deposit of the closing cash above a Rs 15,000 float into the default bank
    // account - what a real shop does - plus a spread of open/cancelled estimates, orders and
    // challans over the last 45 days (some past their validity, so the alert bell has examples).
    private static async Task<(int Documents, int Deposits)> LoadExtrasAsync(IDbConnection connection, IDbTransaction tx, int userId, DateTime startDate, DateTime today)
    {
        var random = new Random(20260202);

        var accounts = (await connection.QueryAsync<AccountLookupRow>("dbo.sp_MoneyAccount_List", transaction: tx, commandType: CommandType.StoredProcedure)).ToList();
        var cash = accounts.FirstOrDefault(a => a.Kind == "CASH");
        var bank = accounts.Where(a => a.Kind == "BANK").OrderByDescending(a => a.IsDefault).FirstOrDefault();
        var deposits = 0;
        if (bank is not null && bank.OpeningBalance == 0)
        {
            // A real business starts with money in the bank (owner's capital).
            var o = new DynamicParameters();
            o.Add("AccountId", bank.Id);
            o.Add("Name", bank.Name);
            o.Add("Kind", bank.Kind);
            o.Add("BankName", bank.BankName);
            o.Add("AccountNumber", bank.AccountNumber);
            o.Add("Ifsc", bank.Ifsc);
            o.Add("OpeningBalance", DemoBankOpeningBalance);
            o.Add("IsDefault", bank.IsDefault);
            o.Add("Status", bank.Status);
            o.Add("SavedId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            o.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_MoneyAccount_Save", o, tx, commandType: CommandType.StoredProcedure);
        }
        if (cash is not null && bank is not null)
        {
            for (var day = startDate; day <= today; day = day.AddDays(1))
            {
                if (day.DayOfWeek != DayOfWeek.Saturday) continue;
                var ledger = await connection.QuerySingleAsync<LedgerSummary>("dbo.sp_CashBank_Ledger",
                    new { AccountId = cash.Id, From = day, To = day.AddDays(1).AddTicks(-1) }, tx, commandType: CommandType.StoredProcedure);
                var amount = Math.Floor((ledger.ClosingBalance - 15000) / 1000) * 1000;
                if (amount <= 0) continue;
                var p = new DynamicParameters();
                p.Add("Type", "TRANSFER");
                p.Add("FromAccountId", cash.Id);
                p.Add("ToAccountId", bank.Id);
                p.Add("Amount", amount);
                p.Add("Date", day.AddHours(18));
                p.Add("Note", "Demo: weekly cash deposit");
                p.Add("CreatedById", userId);
                p.Add("TransactionId", dbType: DbType.Int32, direction: ParameterDirection.Output);
                p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
                await connection.ExecuteAsync("dbo.sp_CashBank_TransactionCreate", p, tx, commandType: CommandType.StoredProcedure);
                deposits++;
            }
        }

        var products = (await connection.QueryAsync<ProductLookupRow>("dbo.sp_Product_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(p => p.Sku.StartsWith("DEMO-")).ToList();
        var customers = (await connection.QueryAsync<CustomerLookupRow>("dbo.sp_Customer_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(c => c.Notes == "Demo customer").ToList();
        if (products.Count == 0 || customers.Count == 0) return (0, deposits);

        var ctx = new DynamicParameters();
        ctx.Add("CustomerId", null);
        ctx.Add("BusinessState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerExists", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Sale_PrepareContext", ctx, tx, commandType: CommandType.StoredProcedure);
        var businessState = ctx.Get<string?>("BusinessState") ?? "";

        var documents = 0;
        foreach (var (docType, count) in DemoDocuments)
        {
            for (var n = 0; n < count; n++)
            {
                var customer = customers[random.Next(customers.Count)];
                var docDate = today.AddDays(-random.Next(0, 45));
                var lines = products.OrderBy(_ => random.Next()).Take(random.Next(1, 4))
                    .Select(pr => (Product: pr, Qty: (decimal)random.Next(1, 6))).ToList();
                var totals = GstService.ComputeInvoiceTotals(
                    lines.Select(l => new LineItemInput(l.Qty, l.Product.SellingPrice, 0, l.Product.GstRate)),
                    IsInterstate(businessState, customer.State));

                var p = new DynamicParameters();
                p.Add("DocType", docType);
                p.Add("DocDate", docDate);
                p.Add("DueDate", docDate.AddDays(docType == "ESTIMATE" ? 15 : 7));
                p.Add("CustomerId", customer.Id);
                p.Add("Subtotal", totals.Subtotal);
                p.Add("Discount", totals.Discount);
                p.Add("TaxableAmount", totals.TaxableAmount);
                p.Add("Cgst", totals.Cgst);
                p.Add("Sgst", totals.Sgst);
                p.Add("Igst", totals.Igst);
                p.Add("GrandTotal", Math.Round(totals.GrandTotal, 2));
                p.Add("Notes", docType == "ESTIMATE" ? "Demo: prices valid for 15 days" : "Demo document");
                p.Add("ItemsJson", JsonSerializer.Serialize(lines.Select((l, idx) => new
                {
                    productId = l.Product.Id, productName = l.Product.Name,
                    quantity = totals.Items[idx].Quantity, rate = totals.Items[idx].Rate, discount = totals.Items[idx].Discount,
                    gstRate = totals.Items[idx].GstRate, taxableAmount = totals.Items[idx].TaxableAmount,
                    gstAmount = totals.Items[idx].GstAmount, total = totals.Items[idx].Total,
                })));
                p.Add("CreatedById", userId);
                p.Add("DocumentId", dbType: DbType.Int32, direction: ParameterDirection.Output);
                p.Add("DocNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
                await connection.ExecuteAsync("dbo.sp_SalesDocument_Create", p, tx, commandType: CommandType.StoredProcedure);
                documents++;

                if (random.NextDouble() < 0.15)
                {
                    var c = new DynamicParameters();
                    c.Add("DocumentId", p.Get<int>("DocumentId"));
                    c.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
                    await connection.ExecuteAsync("dbo.sp_SalesDocument_Cancel", c, tx, commandType: CommandType.StoredProcedure);
                }
            }
        }
        return (documents, deposits);
    }

    private static async Task<bool> CreateSaleAsync(
        IDbConnection connection, IDbTransaction tx, Random random, DateTime invoiceDate,
        List<DemoProduct> products, List<(int Id, string State)> customers, Dictionary<int, decimal> stock,
        string businessState, int userId, List<PendingSettlement> pending, DateTime today)
    {
        var isWalkIn = random.NextDouble() < 0.35;
        (int Id, string State)? customer = isWalkIn ? null : customers[random.Next(customers.Count)];

        var lines = new List<(DemoProduct Product, decimal Qty, decimal Discount)>();
        var itemCount = random.Next(1, 5);
        foreach (var product in products.OrderBy(_ => random.Next()).Take(itemCount))
        {
            var qty = (decimal)random.Next(1, product.Seed.MaxQtyPerSale + 1);
            if (stock[product.Id] < qty) continue;
            var discount = random.NextDouble() < 0.2 ? RoundRupees(qty * product.Seed.Selling * 0.05m) : 0m;
            lines.Add((product, qty, discount));
        }
        if (lines.Count == 0) return false;

        var isInterstate = IsInterstate(businessState, customer?.State);
        var totals = GstService.ComputeInvoiceTotals(
            lines.Select(l => new LineItemInput(l.Qty, l.Product.Seed.Selling, l.Discount, l.Product.Seed.GstRate)), isInterstate);
        var grandTotal = Math.Round(totals.GrandTotal, 2);

        // Walk-ins always pay in full; named customers: 60% full, 20% partial, 20% on credit.
        var roll = random.NextDouble();
        var method = SaleMethods[random.Next(SaleMethods.Length)];
        decimal paid = isWalkIn || roll < 0.6 ? grandTotal
            : roll < 0.8 ? RoundRupees(grandTotal * (decimal)Between(random, 0.3, 0.7))
            : 0m;
        var payments = paid > 0 ? new[] { new { method, amount = paid } } : [];
        var due = Math.Max(0, grandTotal - paid);

        var itemsJson = JsonSerializer.Serialize(lines.Select((l, idx) => new
        {
            productId = l.Product.Id,
            productName = l.Product.Seed.Name,
            quantity = totals.Items[idx].Quantity,
            rate = totals.Items[idx].Rate,
            discount = totals.Items[idx].Discount,
            gstRate = totals.Items[idx].GstRate,
            taxableAmount = totals.Items[idx].TaxableAmount,
            gstAmount = totals.Items[idx].GstAmount,
            total = totals.Items[idx].Total,
        }));

        var p = new DynamicParameters();
        p.Add("InvoiceDate", invoiceDate);
        p.Add("CustomerId", customer?.Id);
        p.Add("Subtotal", totals.Subtotal);
        p.Add("Discount", totals.Discount);
        p.Add("TaxableAmount", totals.TaxableAmount);
        p.Add("Cgst", totals.Cgst);
        p.Add("Sgst", totals.Sgst);
        p.Add("Igst", totals.Igst);
        p.Add("GrandTotal", grandTotal);
        p.Add("PaidAmount", paid);
        p.Add("DueAmount", due);
        p.Add("PaymentStatus", paid <= 0 ? "DUE" : due <= 0 ? "PAID" : "PARTIAL");
        p.Add("PaymentMethod", paid <= 0 ? "CREDIT" : method);
        p.Add("ItemsJson", itemsJson);
        p.Add("PaymentsJson", JsonSerializer.Serialize(payments));
        p.Add("CreatedById", userId);
        p.Add("SaleId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("InvoiceNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
        await connection.ExecuteAsync("dbo.sp_Sale_Create", p, tx, commandType: CommandType.StoredProcedure);

        foreach (var l in lines) stock[l.Product.Id] -= l.Qty;

        // ~75% of open dues get collected 5–30 days later (if that date isn't in the future);
        // the rest stay outstanding so the receivables screens have something to show.
        if (due > 0 && customer is not null && random.NextDouble() < 0.75)
        {
            var settleDate = invoiceDate.Date.AddDays(random.Next(5, 31));
            if (settleDate <= today)
                pending.Add(new PendingSettlement(settleDate, customer.Value.Id, p.Get<int>("SaleId"), due, random.NextDouble() < 0.5 ? "UPI" : "BANK", true));
        }
        return true;
    }

    private static async Task<int> CreatePurchaseAsync(
        IDbConnection connection, IDbTransaction tx, Random random, DateTime day,
        (int Id, string Name, string State) supplier, List<DemoProduct> items, Dictionary<int, decimal> stock,
        string businessState, int userId, List<PendingSettlement> pending)
    {
        var lines = items.Select(product =>
        {
            var target = product.Seed.Opening * 1.2m;
            var qty = Math.Max(product.Seed.Minimum * 2, Math.Ceiling(target - Math.Max(0, stock[product.Id])));
            return (Product: product, Qty: qty);
        }).ToList();

        var isInterstate = IsInterstate(businessState, supplier.State);
        var totals = GstService.ComputeInvoiceTotals(
            lines.Select(l => new LineItemInput(l.Qty, l.Product.Seed.Purchase, 0, l.Product.Seed.GstRate)), isInterstate);
        var grandTotal = Math.Round(totals.GrandTotal, 2);

        var roll = random.NextDouble();
        decimal paid = roll < 0.5 ? grandTotal : roll < 0.8 ? RoundRupees(grandTotal * 0.5m) : 0m;
        var due = Math.Max(0, grandTotal - paid);
        var payments = paid > 0 ? new[] { new { method = "BANK", amount = paid } } : [];

        var itemsJson = JsonSerializer.Serialize(lines.Select((l, idx) => new
        {
            productId = l.Product.Id,
            productName = l.Product.Seed.Name,
            quantity = totals.Items[idx].Quantity,
            rate = totals.Items[idx].Rate,
            discount = totals.Items[idx].Discount,
            gstRate = totals.Items[idx].GstRate,
            taxableAmount = totals.Items[idx].TaxableAmount,
            gstAmount = totals.Items[idx].GstAmount,
            total = totals.Items[idx].Total,
        }));

        var p = new DynamicParameters();
        p.Add("PurchaseDate", day.AddHours(11));
        p.Add("SupplierId", supplier.Id);
        p.Add("SupplierInvoiceNumber", $"SI/{day:yyMM}/{random.Next(1000, 9999)}");
        p.Add("Subtotal", totals.Subtotal);
        p.Add("Discount", totals.Discount);
        p.Add("TaxableAmount", totals.TaxableAmount);
        p.Add("Cgst", totals.Cgst);
        p.Add("Sgst", totals.Sgst);
        p.Add("Igst", totals.Igst);
        p.Add("GrandTotal", grandTotal);
        p.Add("PaidAmount", paid);
        p.Add("DueAmount", due);
        p.Add("PaymentStatus", paid <= 0 ? "DUE" : due <= 0 ? "PAID" : "PARTIAL");
        p.Add("PaymentMethod", paid <= 0 ? "CREDIT" : "BANK");
        p.Add("ItemsJson", itemsJson);
        p.Add("PaymentsJson", JsonSerializer.Serialize(payments));
        p.Add("CreatedById", userId);
        p.Add("PurchaseId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("PurchaseNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
        await connection.ExecuteAsync("dbo.sp_Purchase_Create", p, tx, commandType: CommandType.StoredProcedure);

        foreach (var l in lines) stock[l.Product.Id] += l.Qty;

        var purchaseId = p.Get<int>("PurchaseId");
        if (due > 0 && random.NextDouble() < 0.8)
            pending.Add(new PendingSettlement(day.AddDays(random.Next(10, 40)), supplier.Id, purchaseId, due, "BANK", false));
        return purchaseId;
    }

    private static async Task<bool> SettleAsync(IDbConnection connection, IDbTransaction tx, PendingSettlement s, int userId)
    {
        var p = new DynamicParameters();
        p.Add(s.IsSale ? "CustomerId" : "SupplierId", s.PartyId);
        p.Add(s.IsSale ? "SaleId" : "PurchaseId", s.DocumentId);
        p.Add("Amount", s.Amount);
        p.Add("Method", s.Method);
        p.Add("Date", s.Date.AddHours(12));
        p.Add("ReferenceNo", s.Method == "BANK" ? $"NEFT{s.DocumentId:D6}" : null);
        p.Add("Notes", "Demo settlement");
        p.Add("CreatedById", userId);
        p.Add("PaymentId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("PaymentNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
        p.Add("NotFound", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        p.Add("ExceedsDue", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        p.Add("DueAmount", dbType: DbType.Decimal, direction: ParameterDirection.Output, precision: 18, scale: 2);
        p.Add("CreatedAt", dbType: DbType.DateTime2, direction: ParameterDirection.Output);
        await connection.ExecuteAsync(s.IsSale ? "dbo.sp_Payment_Receive" : "dbo.sp_Payment_Pay", p, tx, commandType: CommandType.StoredProcedure);
        return !p.Get<bool>("NotFound") && !p.Get<bool>("ExceedsDue");
    }

    private static async Task CreateExpenseAsync(
        IDbConnection connection, IDbTransaction tx, Dictionary<string, int> categoryIds,
        string category, string description, decimal amount, DateTime date, string method, int userId)
    {
        if (!categoryIds.TryGetValue(category, out var categoryId))
        {
            var cp = new DynamicParameters();
            cp.Add("Name", category);
            cp.Add("ExpenseCategoryId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_ExpenseCategory_Create", cp, tx, commandType: CommandType.StoredProcedure);
            categoryId = cp.Get<int>("ExpenseCategoryId");
            categoryIds[category] = categoryId;
        }

        var p = new DynamicParameters();
        p.Add("CategoryId", categoryId);
        p.Add("Amount", amount);
        p.Add("Date", date.AddHours(13));
        p.Add("PaymentMethod", method);
        p.Add("Description", description);
        p.Add("CreatedById", userId);
        p.Add("ExpenseId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Expense_Create", p, tx, commandType: CommandType.StoredProcedure);
    }

    private static async Task<Dictionary<string, int>> EnsureCategoriesAsync(IDbConnection connection, IDbTransaction tx, IEnumerable<string> names)
    {
        var existing = (await connection.QueryAsync<(int Id, string Name)>("dbo.sp_Category_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);
        foreach (var name in names)
        {
            if (existing.ContainsKey(name)) continue;
            var p = new DynamicParameters();
            p.Add("Name", name);
            p.Add("CategoryId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Category_Create", p, tx, commandType: CommandType.StoredProcedure);
            existing[name] = p.Get<int>("CategoryId");
        }
        return existing;
    }

    private static async Task<Dictionary<string, int>> EnsureUnitsAsync(IDbConnection connection, IDbTransaction tx, IEnumerable<string> names)
    {
        var existing = (await connection.QueryAsync<(int Id, string Name)>("dbo.sp_Unit_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Id, StringComparer.OrdinalIgnoreCase);
        foreach (var name in names)
        {
            if (existing.ContainsKey(name)) continue;
            var p = new DynamicParameters();
            p.Add("Name", name);
            p.Add("ShortName", name.Length <= 4 ? name.ToUpperInvariant() : name[..3].ToUpperInvariant());
            p.Add("UnitId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Unit_Create", p, tx, commandType: CommandType.StoredProcedure);
            existing[name] = p.Get<int>("UnitId");
        }
        return existing;
    }

    private static bool IsInterstate(string businessState, string? partyState) =>
        !string.IsNullOrEmpty(businessState) && !string.IsNullOrEmpty(partyState)
        && !string.Equals(businessState, partyState, StringComparison.OrdinalIgnoreCase);

    private static double Between(Random random, double min, double max) => min + random.NextDouble() * (max - min);
    private static decimal Between(Random random, decimal min, decimal max) => min + (decimal)random.NextDouble() * (max - min);
    private static decimal RoundRupees(decimal value) => Math.Round(value, 0, MidpointRounding.AwayFromZero);

    public const string DemoPortalPassword = "Demo@123";

    private static readonly string[] DemoGstinCustomers =
        ["Amit Traders", "Rohit Electronics", "Vikas General Store", "Sai Mobile Point", "Raj Hardware", "Shree Ganesh Stores", "City Supermart", "Bharat Stationers"];

    private static readonly string[] DemoPortalCustomers = ["Amit Traders", "Neha Gupta", "Rohit Electronics"];

    private class DemoCustomerRow
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string? State { get; set; }
        public string? Gstin { get; set; }
        public string? Notes { get; set; }
    }

    private class DemoDocRow
    {
        public int Id { get; set; }
        public int? CustomerId { get; set; }
        public int SupplierId { get; set; }
        public string Status { get; set; } = "";
        public DateTime InvoiceDate { get; set; }
        public DateTime PurchaseDate { get; set; }
    }

    private class DemoLineRow
    {
        public int ProductId { get; set; }
        public string ProductName { get; set; } = "";
        public decimal Quantity { get; set; }
        public decimal Rate { get; set; }
    }

    // Demo data for the later features: GSTINs on some customers (so GSTR-1 shows B2B), customer-portal
    // logins, a few credit / debit notes, and paused recurring templates. Each part checks its own
    // marker so running it twice never duplicates anything.
    private async Task<int> LoadExtras2Async(IDbConnection connection, IDbTransaction tx, int userId, DateTime today)
    {
        var added = 0;
        var random = new Random(20260303);
        var customers = (await connection.QueryAsync<DemoCustomerRow>("dbo.sp_Customer_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(c => c.Notes == "Demo customer").ToList();
        if (customers.Count == 0) return 0;

        // 1) GSTINs — demo format only (state code + PAN-like + entity + Z + check char); not real registrations.
        foreach (var c in customers.Where(c => DemoGstinCustomers.Contains(c.Name) && string.IsNullOrEmpty(c.Gstin)))
        {
            var code = gst.StateCode(c.State) ?? "07";
            var letters = new string(c.Name.Where(char.IsLetter).Select(char.ToUpperInvariant).Take(3).ToArray()).PadRight(3, 'X');
            var gstin = $"{code}AA{letters}{random.Next(1000, 9999)}{(char)('A' + random.Next(26))}1Z{random.Next(1, 9)}";
            await connection.ExecuteAsync("dbo.sp_Customer_Update", new { CustomerId = c.Id, Gstin = gstin }, tx, commandType: CommandType.StoredProcedure);
            added++;
        }

        // 2) Portal logins
        var hash = Auth.PasswordHasher.Hash(DemoPortalPassword);
        foreach (var c in customers.Where(c => DemoPortalCustomers.Contains(c.Name)))
        {
            var p = new DynamicParameters();
            p.Add("CustomerId", c.Id);
            p.Add("PasswordHash", hash);
            p.Add("IsEnabled", true);
            p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Portal_Save", p, tx, commandType: CommandType.StoredProcedure);
            added++;
        }

        // 3) Credit notes on three recent demo-customer invoices, one debit note on a recent purchase.
        var demoIds = customers.Select(c => c.Id).ToHashSet();
        var sales = (await connection.QueryAsync<DemoDocRow>("dbo.sp_Sale_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(s => s.Status == "CONFIRMED" && s.CustomerId is not null && demoIds.Contains(s.CustomerId.Value) && s.InvoiceDate >= today.AddDays(-45))
            .OrderBy(_ => random.Next()).Take(3).ToList();
        string[] refunds = ["Cash", "UPI", "Store Credit"];
        string[] reasons = ["Damaged in transit", "Customer changed mind", "Wrong size / model"];
        for (var i = 0; i < sales.Count; i++)
        {
            using var multi = await connection.QueryMultipleAsync("dbo.sp_Sale_GetById", new { SaleId = sales[i].Id }, tx, commandType: CommandType.StoredProcedure);
            await multi.ReadAsync<dynamic>();
            await multi.ReadAsync<dynamic>();
            await multi.ReadAsync<dynamic>();
            var line = (await multi.ReadAsync<DemoLineRow>()).FirstOrDefault();
            if (line is null) continue;
            var p = new DynamicParameters();
            p.Add("SaleId", sales[i].Id);
            p.Add("Reason", $"Demo: {reasons[i % reasons.Length]}");
            p.Add("RefundMethod", refunds[i % refunds.Length]);
            p.Add("TotalAmount", line.Rate);
            p.Add("ItemsJson", JsonSerializer.Serialize(new[] { new { productId = line.ProductId, productName = line.ProductName, quantity = 1m, rate = line.Rate, total = line.Rate } }));
            p.Add("CreatedById", userId);
            p.Add("SaleReturnId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            p.Add("ReturnNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
            p.Add("NotFound", dbType: DbType.Boolean, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_SaleReturn_Create", p, tx, commandType: CommandType.StoredProcedure);
            added++;
        }

        var purchase = (await connection.QueryAsync<DemoDocRow>("dbo.sp_Purchase_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(x => x.Status == "CONFIRMED" && x.PurchaseDate >= today.AddDays(-30)).OrderBy(_ => random.Next()).FirstOrDefault();
        if (purchase is not null)
        {
            using var multi = await connection.QueryMultipleAsync("dbo.sp_Purchase_GetById", new { PurchaseId = purchase.Id }, tx, commandType: CommandType.StoredProcedure);
            await multi.ReadAsync<dynamic>();
            await multi.ReadAsync<dynamic>();
            await multi.ReadAsync<dynamic>();
            var line = (await multi.ReadAsync<DemoLineRow>()).FirstOrDefault(l => l.Quantity >= 2);
            if (line is not null)
            {
                var p = new DynamicParameters();
                p.Add("PurchaseId", purchase.Id);
                p.Add("Reason", "Demo: Defective pieces returned to supplier");
                p.Add("TotalAmount", line.Rate * 2);
                p.Add("ItemsJson", JsonSerializer.Serialize(new[] { new { productId = line.ProductId, productName = line.ProductName, quantity = 2m, rate = line.Rate, total = line.Rate * 2 } }));
                p.Add("CreatedById", userId);
                p.Add("PurchaseReturnId", dbType: DbType.Int32, direction: ParameterDirection.Output);
                p.Add("ReturnNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
                p.Add("NotFound", dbType: DbType.Boolean, direction: ParameterDirection.Output);
                await connection.ExecuteAsync("dbo.sp_PurchaseReturn_Create", p, tx, commandType: CommandType.StoredProcedure);
                added++;
            }
        }

        // 4) Paused recurring templates (turn on from Sales → Recurring Invoices).
        var products = (await connection.QueryAsync<ProductLookupRow>("dbo.sp_Product_List", transaction: tx, commandType: CommandType.StoredProcedure))
            .Where(p => p.Sku.StartsWith("DEMO-")).ToDictionary(p => p.Name);
        var templates = new (string Name, string Customer, string Frequency, (string Product, decimal Qty)[] Items)[]
        {
            ("Monthly office supplies", "Bharat Stationers", "MONTHLY", [("JK Copier A4 Paper Ream", 5), ("Reynolds Ball Pen (Pack of 10)", 4)]),
            ("Weekly grocery supply", "City Supermart", "WEEKLY", [("Aashirvaad Atta 10kg", 3), ("Sugar", 10), ("Tata Salt 1kg", 6)]),
        };
        var firstOfNextMonth = new DateTime(today.Year, today.Month, 1).AddMonths(1);
        foreach (var tpl in templates)
        {
            var customer = customers.FirstOrDefault(c => c.Name == tpl.Customer);
            if (customer is null || tpl.Items.Any(i => !products.ContainsKey(i.Product))) continue;
            var p = new DynamicParameters();
            p.Add("RecurringId", null);
            p.Add("Name", tpl.Name);
            p.Add("CustomerId", customer.Id);
            p.Add("Frequency", tpl.Frequency);
            p.Add("StartDate", firstOfNextMonth);
            p.Add("EndDate", null);
            p.Add("NextRunDate", firstOfNextMonth);
            p.Add("IsActive", false);
            p.Add("Notes", "Demo template (paused) - turn on to auto-bill");
            p.Add("ItemsJson", JsonSerializer.Serialize(tpl.Items.Select(i => new
            {
                productId = products[i.Product].Id, productName = i.Product, quantity = i.Qty,
                rate = products[i.Product].SellingPrice, discount = 0m, gstRate = products[i.Product].GstRate,
            })));
            p.Add("CreatedById", userId);
            p.Add("SavedId", dbType: DbType.Int32, direction: ParameterDirection.Output);
            p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Recurring_Save", p, tx, commandType: CommandType.StoredProcedure);
            added++;
        }
        return added;
    }
}
