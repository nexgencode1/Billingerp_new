using System.Data;
using System.Text;
using System.Text.Json;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

public record BackupFileInfo(string Name, long SizeBytes, DateTime CreatedAt);

// Full-database JSON export (same format as Settings → Backup → Download) plus scheduled backups to a
// folder. Pointing Backup:Directory at a Google Drive / OneDrive / Dropbox desktop-sync folder gives
// free off-site "cloud" backup without any API keys.
// TODO: paid option — direct upload to S3 / Azure Blob / Google Drive API with service credentials.
public class BackupService(SqlConnectionFactory connectionFactory, IConfiguration config, IWebHostEnvironment env)
{
    // Children-first order (safe delete order); reversed = parent-first (safe insert order).
    public static readonly string[] TablesChildToParent =
    [
        "AuditLogs", "Notifications", "CashBankTransactions", "MoneyAccounts", "SalesDocumentItems", "SalesDocuments",
        "CustomerPortalAccounts", "PaymentReminders", "RecurringInvoiceItems", "RecurringInvoices", "HsnCodes",
        "ProductionConsumptions", "ProductionOrders", "BOMItems", "Payrolls",
        "Attendances", "Employees", "LeadActivities", "Leads", "Expenses", "ExpenseCategories", "StockAdjustments",
        "StockTransactions", "Payments", "PurchaseReturnItems", "PurchaseReturns", "PurchaseItems", "Purchases",
        "SaleReturnItems", "SaleReturns", "SaleItems", "Sales", "Suppliers", "Customers", "Products", "Units",
        "Brands", "Categories", "Businesses", "Users", "RolePermissions", "Permissions", "Roles",
    ];

    public bool AutoEnabled => config.GetValue("Backup:AutoEnabled", true);
    public int KeepCount => Math.Max(1, config.GetValue("Backup:KeepCount", 30));
    public int RunAtHour => Math.Clamp(config.GetValue("Backup:RunAtHour", 23), 0, 23);

    public string Directory
    {
        get
        {
            var configured = config["Backup:Directory"];
            return string.IsNullOrWhiteSpace(configured) ? Path.Combine(env.ContentRootPath, "backups") : configured;
        }
    }

    public Task<string> ExportJsonAsync() => Task.Run(ExportJson);

    private string ExportJson()
    {
        using var connection = connectionFactory.Create();
        var data = new Dictionary<string, JsonElement>();
        foreach (var table in TablesChildToParent.Reverse()) // parent-first, matches original's export order
        {
            var parameters = new DynamicParameters();
            parameters.Add("TableName", table);
            parameters.Add("Json", dbType: DbType.String, direction: ParameterDirection.Output, size: -1);
            // Synchronous on purpose: Microsoft.Data.SqlClient reads large NVARCHAR(MAX) values extremely
            // slowly on the async path (a 1.7 MB export took ~3 minutes async vs seconds sync).
            connection.Execute("dbo.sp_Backup_ExportTable", parameters, commandType: CommandType.StoredProcedure, commandTimeout: 300);
            data[table] = JsonDocument.Parse(parameters.Get<string>("Json")).RootElement.Clone();
        }
        var payload = new { exportedAt = DateTime.UtcNow, version = 1, data };
        return JsonSerializer.Serialize(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    }

    // Writes a backup file and prunes the oldest beyond KeepCount. Returns the new file.
    public async Task<BackupFileInfo> WriteBackupFileAsync()
    {
        System.IO.Directory.CreateDirectory(Directory);
        var name = $"billing-erp-backup-{DateTime.Now:yyyy-MM-dd-HHmmss}.json";
        var path = Path.Combine(Directory, name);
        var json = await ExportJsonAsync();
        var temp = path + ".tmp";
        await File.WriteAllTextAsync(temp, json, Encoding.UTF8);
        File.Move(temp, path, overwrite: true); // never leave a half-written backup with the final name

        foreach (var old in ListBackups().Skip(KeepCount))
        {
            try { File.Delete(Path.Combine(Directory, old.Name)); } catch { /* best effort */ }
        }
        var info = new FileInfo(path);
        return new BackupFileInfo(info.Name, info.Length, info.LastWriteTime);
    }

    public List<BackupFileInfo> ListBackups()
    {
        if (!System.IO.Directory.Exists(Directory)) return [];
        return new DirectoryInfo(Directory).GetFiles("billing-erp-backup-*.json")
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .Select(f => new BackupFileInfo(f.Name, f.Length, f.LastWriteTime))
            .ToList();
    }

    // Only plain file names from our own listing are accepted — no paths, no traversal.
    public string? ResolveBackupPath(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || !name.StartsWith("billing-erp-backup-") || !name.EndsWith(".json"))
            return null;
        var path = Path.Combine(Directory, name);
        return File.Exists(path) ? path : null;
    }
}

// Daily automatic backup at Backup:RunAtHour (local time), if Backup:AutoEnabled (default on).
public class AutoBackupWorker(IServiceScopeFactory scopes, ILogger<AutoBackupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            int runAt;
            using (var scope = scopes.CreateScope())
                runAt = scope.ServiceProvider.GetRequiredService<BackupService>().RunAtHour;

            var now = DateTime.Now;
            var next = now.Date.AddHours(runAt);
            if (next <= now) next = next.AddDays(1);
            await Task.Delay(next - now, stoppingToken);

            try
            {
                using var scope = scopes.CreateScope();
                var backups = scope.ServiceProvider.GetRequiredService<BackupService>();
                if (!backups.AutoEnabled) continue;
                var file = await backups.WriteBackupFileAsync();
                logger.LogInformation("Automatic backup written: {File} ({Size} bytes)", file.Name, file.SizeBytes);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Automatic backup failed");
            }
        }
    }
}
