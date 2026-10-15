using BillingErp.Api.Auth;
using BillingErp.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace BillingErp.Api.Data;

// Ports prisma/seed.js exactly (roles/permissions/business/demo users/master data). Every step
// is upsert-style (check-then-create) so this is safe to run on every app startup, like the
// original script.
public static class DbSeeder
{
    private static readonly string[] Modules =
    [
        "DASHBOARD", "SALES", "PURCHASE", "PRODUCTS", "INVENTORY", "CUSTOMERS", "SUPPLIERS",
        "CRM", "HR", "MANUFACTURING", "EXPENSES", "PAYMENTS", "REPORTS", "USERS", "SETTINGS",
    ];
    private static readonly string[] Actions = ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT", "PRINT"];

    private static readonly Dictionary<string, Dictionary<string, string[]>> RoleGrants = new()
    {
        ["SUPER_ADMIN"] = new() { ["*"] = ["*"] },
        ["ADMIN"] = new() { ["*"] = ["*"] },
        ["MANAGER"] = new()
        {
            ["DASHBOARD"] = ["VIEW"],
            ["SALES"] = ["VIEW", "CREATE", "EDIT", "EXPORT", "PRINT"],
            ["PURCHASE"] = ["VIEW", "CREATE", "EDIT", "EXPORT", "PRINT"],
            ["PRODUCTS"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["INVENTORY"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["CUSTOMERS"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["SUPPLIERS"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["CRM"] = ["VIEW", "CREATE", "EDIT"],
            ["HR"] = ["VIEW", "CREATE", "EDIT"],
            ["MANUFACTURING"] = ["VIEW", "CREATE", "EDIT"],
            ["EXPENSES"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["PAYMENTS"] = ["VIEW", "CREATE", "EXPORT"],
            ["REPORTS"] = ["VIEW", "EXPORT", "PRINT"],
        },
        ["ACCOUNTANT"] = new()
        {
            ["DASHBOARD"] = ["VIEW"],
            ["SALES"] = ["VIEW", "EXPORT", "PRINT"],
            ["PURCHASE"] = ["VIEW", "EXPORT", "PRINT"],
            ["PRODUCTS"] = ["VIEW"],
            ["INVENTORY"] = ["VIEW"],
            ["CUSTOMERS"] = ["VIEW", "EXPORT"],
            ["SUPPLIERS"] = ["VIEW", "EXPORT"],
            ["EXPENSES"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["PAYMENTS"] = ["VIEW", "CREATE", "EDIT", "EXPORT"],
            ["REPORTS"] = ["VIEW", "EXPORT", "PRINT"],
        },
        ["CASHIER"] = new()
        {
            ["DASHBOARD"] = ["VIEW"],
            ["SALES"] = ["VIEW", "CREATE", "PRINT"],
            ["PRODUCTS"] = ["VIEW"],
            ["CUSTOMERS"] = ["VIEW", "CREATE"],
            ["PAYMENTS"] = ["VIEW", "CREATE"],
            ["REPORTS"] = ["VIEW"],
        },
        ["STAFF"] = new()
        {
            ["DASHBOARD"] = ["VIEW"],
            ["PRODUCTS"] = ["VIEW"],
            ["INVENTORY"] = ["VIEW"],
        },
    };

    public static async Task SeedAsync(AppDbContext db)
    {
        // Permissions
        var permissionByKey = new Dictionary<string, int>();
        foreach (var module in Modules)
        {
            foreach (var action in Actions)
            {
                var perm = await db.Permissions.FirstOrDefaultAsync(p => p.Module == module && p.Action == action);
                if (perm is null)
                {
                    perm = new Permission { Module = module, Action = action };
                    db.Permissions.Add(perm);
                    await db.SaveChangesAsync();
                }
                permissionByKey[$"{module}:{action}"] = perm.Id;
            }
        }

        // Roles + RolePermission
        var roleByName = new Dictionary<string, Role>();
        foreach (var roleName in RoleGrants.Keys)
        {
            var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
            if (role is null)
            {
                role = new Role { Name = roleName };
                db.Roles.Add(role);
                await db.SaveChangesAsync();
            }
            roleByName[roleName] = role;

            var grants = RoleGrants[roleName];
            var wantsAllModules = grants.ContainsKey("*");
            foreach (var module in Modules)
            {
                var actions = wantsAllModules ? grants["*"] : (grants.TryGetValue(module, out var a) ? a : null);
                if (actions is null) continue;
                var resolvedActions = actions.Contains("*") ? Actions : actions;
                foreach (var action in resolvedActions)
                {
                    if (!permissionByKey.TryGetValue($"{module}:{action}", out var permissionId)) continue;
                    var exists = await db.RolePermissions.AnyAsync(rp => rp.RoleId == role.Id && rp.PermissionId == permissionId);
                    if (!exists) db.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = permissionId });
                }
            }
            await db.SaveChangesAsync();
        }

        // Business profile (single row)
        if (!await db.Businesses.AnyAsync())
        {
            db.Businesses.Add(new Business
            {
                Name = "My Business Pvt Ltd",
                Address = "123 Market Road, Delhi",
                Phone = "9876543210",
                Email = "info@mybusiness.com",
                Gstin = "07AAAAA0000A1Z5",
                State = "Delhi",
                Pincode = "110001",
                BankName = "State Bank of India",
                AccountNumber = "000123456789",
                Ifsc = "SBIN0000001",
                UpiId = "mybusiness@upi",
                TermsText = "Goods once sold will not be taken back.",
            });
            await db.SaveChangesAsync();
        }

        // Cash & Bank: one Cash in Hand account, plus a default bank account built from the business
        // profile's bank details (only when there are no accounts yet, so user edits are never undone).
        if (!await db.MoneyAccounts.AnyAsync())
        {
            var business = await db.Businesses.FirstAsync();
            db.MoneyAccounts.Add(new MoneyAccount { Name = "Cash in Hand", Kind = "CASH" });
            db.MoneyAccounts.Add(new MoneyAccount
            {
                Name = business.BankName ?? "Bank Account",
                Kind = "BANK",
                BankName = business.BankName,
                AccountNumber = business.AccountNumber,
                Ifsc = business.Ifsc,
                IsDefault = true,
            });
            await db.SaveChangesAsync();
        }

        // Admin user
        var adminRole = roleByName["ADMIN"];
        var admin = await db.Users.FirstOrDefaultAsync(u => u.Email == "admin@business.local");
        if (admin is null)
        {
            admin = new User
            {
                Name = "Admin",
                Email = "admin@business.local",
                Password = PasswordHasher.Hash("Admin@123"),
                Mobile = "9999999999",
                RoleId = adminRole.Id,
                Status = true,
            };
            db.Users.Add(admin);
            await db.SaveChangesAsync();
        }

        // Cashier demo user
        var cashierRole = roleByName["CASHIER"];
        if (!await db.Users.AnyAsync(u => u.Email == "cashier@business.local"))
        {
            db.Users.Add(new User
            {
                Name = "Cashier",
                Email = "cashier@business.local",
                Password = PasswordHasher.Hash("Cashier@123"),
                Mobile = "9888888888",
                RoleId = cashierRole.Id,
                Status = true,
            });
            await db.SaveChangesAsync();
        }

        // Units
        (string Name, string ShortName)[] unitSeeds =
        [
            ("Piece", "Pcs"), ("Kg", "Kg"), ("Gram", "g"), ("Liter", "L"), ("Box", "Box"), ("Dozen", "Dz"),
        ];
        var unitByName = new Dictionary<string, Unit>();
        foreach (var (name, shortName) in unitSeeds)
        {
            var unit = await db.Units.FirstOrDefaultAsync(u => u.Name == name);
            if (unit is null)
            {
                unit = new Unit { Name = name, ShortName = shortName };
                db.Units.Add(unit);
                await db.SaveChangesAsync();
            }
            unitByName[name] = unit;
        }

        // Categories
        string[] categoryNames = ["Electronics", "Groceries", "Stationery"];
        var categoryByName = new Dictionary<string, Category>();
        foreach (var name in categoryNames)
        {
            var category = await db.Categories.FirstOrDefaultAsync(c => c.Name == name);
            if (category is null)
            {
                category = new Category { Name = name };
                db.Categories.Add(category);
                await db.SaveChangesAsync();
            }
            categoryByName[name] = category;
        }

        // Products
        var productSeeds = new[]
        {
            new { Name = "Laptop", Sku = "SKU-LAPTOP-001", Category = "Electronics", UnitName = "Piece", PurchasePrice = 42000m, SellingPrice = 50000m, Mrp = (decimal?)55000m, GstRate = 18m, OpeningStock = 10m, MinimumStock = 2m, HsnCode = "8471" },
            new { Name = "Wireless Mouse", Sku = "SKU-MOUSE-001", Category = "Electronics", UnitName = "Piece", PurchasePrice = 350m, SellingPrice = 500m, Mrp = (decimal?)599m, GstRate = 18m, OpeningStock = 50m, MinimumStock = 10m, HsnCode = "8471" },
            new { Name = "A4 Paper Ream", Sku = "SKU-PAPER-001", Category = "Stationery", UnitName = "Box", PurchasePrice = 220m, SellingPrice = 280m, Mrp = (decimal?)300m, GstRate = 12m, OpeningStock = 30m, MinimumStock = 5m, HsnCode = "4802" },
            new { Name = "Rice (Basmati)", Sku = "SKU-RICE-001", Category = "Groceries", UnitName = "Kg", PurchasePrice = 60m, SellingPrice = 85m, Mrp = (decimal?)90m, GstRate = 5m, OpeningStock = 200m, MinimumStock = 20m, HsnCode = "1006" },
        };

        foreach (var p in productSeeds)
        {
            var product = await db.Products.FirstOrDefaultAsync(x => x.Sku == p.Sku);
            if (product is null)
            {
                product = new Product
                {
                    Name = p.Name,
                    Sku = p.Sku,
                    CategoryId = categoryByName[p.Category].Id,
                    UnitId = unitByName[p.UnitName].Id,
                    HsnCode = p.HsnCode,
                    PurchasePrice = p.PurchasePrice,
                    SellingPrice = p.SellingPrice,
                    Mrp = p.Mrp,
                    GstRate = p.GstRate,
                    OpeningStock = p.OpeningStock,
                    MinimumStock = p.MinimumStock,
                };
                db.Products.Add(product);
                await db.SaveChangesAsync();
            }

            var hasOpeningTxn = await db.StockTransactions.AnyAsync(t => t.ProductId == product.Id && t.Type == "OPENING");
            if (!hasOpeningTxn)
            {
                db.StockTransactions.Add(new StockTransaction
                {
                    ProductId = product.Id,
                    Type = "OPENING",
                    QuantityIn = p.OpeningStock,
                    QuantityOut = 0,
                    Balance = p.OpeningStock,
                    Note = "Opening stock",
                    CreatedById = admin.Id,
                });
                await db.SaveChangesAsync();
            }
        }

        // Customers
        (string Name, string Mobile, string City, string State)[] customerSeeds =
        [
            ("Rahul Sharma", "9812345001", "Delhi", "Delhi"),
            ("Priya Verma", "9812345002", "Noida", "Uttar Pradesh"),
        ];
        foreach (var (name, mobile, city, state) in customerSeeds)
        {
            if (!await db.Customers.AnyAsync(c => c.Mobile == mobile))
                db.Customers.Add(new Customer { Name = name, Mobile = mobile, City = city, State = state });
        }
        await db.SaveChangesAsync();

        // Suppliers
        (string Name, string Mobile, string City, string State)[] supplierSeeds =
        [
            ("Sharma Electronics Wholesale", "9911223301", "Delhi", "Delhi"),
            ("National Stationery Supplies", "9911223302", "Gurgaon", "Haryana"),
        ];
        foreach (var (name, mobile, city, state) in supplierSeeds)
        {
            if (!await db.Suppliers.AnyAsync(s => s.Mobile == mobile))
                db.Suppliers.Add(new Supplier { Name = name, Mobile = mobile, City = city, State = state });
        }
        await db.SaveChangesAsync();

        // Expense categories
        string[] expenseCategoryNames =
            ["Rent", "Salary", "Electricity", "Internet", "Transport", "Office", "Marketing", "Maintenance", "Other"];
        foreach (var name in expenseCategoryNames)
        {
            if (!await db.ExpenseCategories.AnyAsync(e => e.Name == name))
                db.ExpenseCategories.Add(new ExpenseCategory { Name = name });
        }
        await db.SaveChangesAsync();
    }
}
