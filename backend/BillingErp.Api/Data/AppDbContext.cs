using BillingErp.Api.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace BillingErp.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

    public DbSet<Business> Businesses => Set<Business>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Unit> Units => Set<Unit>();
    public DbSet<Product> Products => Set<Product>();

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();

    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<SaleReturn> SaleReturns => Set<SaleReturn>();
    public DbSet<SaleReturnItem> SaleReturnItems => Set<SaleReturnItem>();

    public DbSet<Purchase> Purchases => Set<Purchase>();
    public DbSet<PurchaseItem> PurchaseItems => Set<PurchaseItem>();
    public DbSet<PurchaseReturn> PurchaseReturns => Set<PurchaseReturn>();
    public DbSet<PurchaseReturnItem> PurchaseReturnItems => Set<PurchaseReturnItem>();

    public DbSet<Payment> Payments => Set<Payment>();

    public DbSet<StockTransaction> StockTransactions => Set<StockTransaction>();
    public DbSet<StockAdjustment> StockAdjustments => Set<StockAdjustment>();

    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();
    public DbSet<Expense> Expenses => Set<Expense>();

    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<LeadActivity> LeadActivities => Set<LeadActivity>();

    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Attendance> Attendances => Set<Attendance>();
    public DbSet<Payroll> Payrolls => Set<Payroll>();

    public DbSet<BOMItem> BOMItems => Set<BOMItem>();
    public DbSet<ProductionOrder> ProductionOrders => Set<ProductionOrder>();
    public DbSet<ProductionConsumption> ProductionConsumptions => Set<ProductionConsumption>();

    public DbSet<SalesDocument> SalesDocuments => Set<SalesDocument>();
    public DbSet<SalesDocumentItem> SalesDocumentItems => Set<SalesDocumentItem>();

    public DbSet<MoneyAccount> MoneyAccounts => Set<MoneyAccount>();
    public DbSet<CashBankTransaction> CashBankTransactions => Set<CashBankTransaction>();

    public DbSet<HsnCode> HsnCodes => Set<HsnCode>();
    public DbSet<RecurringInvoice> RecurringInvoices => Set<RecurringInvoice>();
    public DbSet<RecurringInvoiceItem> RecurringInvoiceItems => Set<RecurringInvoiceItem>();
    public DbSet<PaymentReminder> PaymentReminders => Set<PaymentReminder>();

    public DbSet<CustomerPortalAccount> CustomerPortalAccounts => Set<CustomerPortalAccount>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Matches Prisma's untyped Float across every money/quantity field.
        configurationBuilder.Properties<decimal>().HavePrecision(18, 2);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Unique constraints (mirrors @unique / @@unique in schema.prisma)
        modelBuilder.Entity<User>().HasIndex(e => e.Email).IsUnique();
        modelBuilder.Entity<Role>().HasIndex(e => e.Name).IsUnique();
        modelBuilder.Entity<Permission>().HasIndex(e => new { e.Module, e.Action }).IsUnique();
        modelBuilder.Entity<RolePermission>().HasIndex(e => new { e.RoleId, e.PermissionId }).IsUnique();
        modelBuilder.Entity<Unit>().HasIndex(e => e.Name).IsUnique();
        modelBuilder.Entity<Product>().HasIndex(e => e.Sku).IsUnique();
        modelBuilder.Entity<Sale>().HasIndex(e => e.InvoiceNumber).IsUnique();
        modelBuilder.Entity<SaleReturn>().HasIndex(e => e.ReturnNumber).IsUnique();
        modelBuilder.Entity<Purchase>().HasIndex(e => e.PurchaseNumber).IsUnique();
        modelBuilder.Entity<PurchaseReturn>().HasIndex(e => e.ReturnNumber).IsUnique();
        modelBuilder.Entity<Payment>().HasIndex(e => e.PaymentNumber).IsUnique();
        modelBuilder.Entity<Attendance>().HasIndex(e => new { e.EmployeeId, e.Date }).IsUnique();
        modelBuilder.Entity<Payroll>().HasIndex(e => new { e.EmployeeId, e.Month, e.Year }).IsUnique();
        modelBuilder.Entity<BOMItem>().HasIndex(e => new { e.FinishedProductId, e.ComponentProductId }).IsUnique();
        modelBuilder.Entity<ProductionOrder>().HasIndex(e => e.OrderNumber).IsUnique();
        modelBuilder.Entity<SalesDocument>().HasIndex(e => e.DocNumber).IsUnique();
        modelBuilder.Entity<SalesDocument>().HasIndex(e => new { e.DocType, e.DocDate });
        modelBuilder.Entity<CashBankTransaction>().HasIndex(e => e.Date);
        modelBuilder.Entity<HsnCode>().HasKey(e => e.Code);
        modelBuilder.Entity<CustomerPortalAccount>().HasKey(e => e.CustomerId);
        modelBuilder.Entity<CustomerPortalAccount>().HasOne(e => e.Customer).WithOne().HasForeignKey<CustomerPortalAccount>(e => e.CustomerId);
        modelBuilder.Entity<HsnCode>().Property(e => e.Code).HasMaxLength(10);
        modelBuilder.Entity<HsnCode>().Property(e => e.GstRate).HasPrecision(5, 2);
        modelBuilder.Entity<RecurringInvoice>().HasIndex(e => new { e.IsActive, e.NextRunDate });
        modelBuilder.Entity<PaymentReminder>().HasIndex(e => new { e.SaleId, e.SentAt });

        modelBuilder.Entity<CashBankTransaction>()
            .HasOne(e => e.FromAccount).WithMany().HasForeignKey(e => e.FromAccountId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<CashBankTransaction>()
            .HasOne(e => e.ToAccount).WithMany().HasForeignKey(e => e.ToAccountId).OnDelete(DeleteBehavior.Restrict);

        // BOMItem has two FKs into Product (finished + component) — name them explicitly.
        modelBuilder.Entity<BOMItem>()
            .HasOne(e => e.FinishedProduct)
            .WithMany(p => p.AsFinishedInBom)
            .HasForeignKey(e => e.FinishedProductId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<BOMItem>()
            .HasOne(e => e.ComponentProduct)
            .WithMany(p => p.AsComponentInBom)
            .HasForeignKey(e => e.ComponentProductId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ProductionConsumption>()
            .HasOne(e => e.ComponentProduct)
            .WithMany(p => p.ProductionConsumed)
            .HasForeignKey(e => e.ComponentProductId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Lead>()
            .HasOne(e => e.AssignedTo)
            .WithMany(u => u.AssignedLeads)
            .HasForeignKey(e => e.AssignedToId)
            .OnDelete(DeleteBehavior.Restrict);

        // Default every FK to Restrict (SQL Server rejects multiple cascade paths, and Prisma
        // itself only cascades the specific parent/child relations below) then opt back in.
        foreach (var fk in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
        {
            fk.DeleteBehavior = DeleteBehavior.Restrict;
        }

        modelBuilder.Entity<RolePermission>().HasOne(e => e.Role).WithMany(r => r.Permissions)
            .HasForeignKey(e => e.RoleId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<RolePermission>().HasOne(e => e.Permission).WithMany(p => p.Roles)
            .HasForeignKey(e => e.PermissionId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SaleItem>().HasOne(e => e.Sale).WithMany(s => s.Items)
            .HasForeignKey(e => e.SaleId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SaleReturnItem>().HasOne(e => e.SaleReturn).WithMany(s => s.Items)
            .HasForeignKey(e => e.SaleReturnId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<PurchaseItem>().HasOne(e => e.Purchase).WithMany(p => p.Items)
            .HasForeignKey(e => e.PurchaseId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<PurchaseReturnItem>().HasOne(e => e.PurchaseReturn).WithMany(p => p.Items)
            .HasForeignKey(e => e.PurchaseReturnId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<LeadActivity>().HasOne(e => e.Lead).WithMany(l => l.Activities)
            .HasForeignKey(e => e.LeadId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<RecurringInvoiceItem>().HasOne(e => e.RecurringInvoice).WithMany(r => r.Items)
            .HasForeignKey(e => e.RecurringInvoiceId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SalesDocumentItem>().HasOne(e => e.SalesDocument).WithMany(d => d.Items)
            .HasForeignKey(e => e.SalesDocumentId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ProductionConsumption>().HasOne(e => e.ProductionOrder).WithMany(o => o.Consumptions)
            .HasForeignKey(e => e.ProductionOrderId).OnDelete(DeleteBehavior.Cascade);
    }
}
