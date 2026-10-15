using System.Data;
using System.Text;
using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/lib/backup.ts + src/app/api/settings/backup/{export,restore}/route.ts, via the
// generic sp_Backup_ExportTable/ClearTable/ImportTable procedures (Data/StoredProcedures/).
// Note: this is a NEW backup file format (JSON keyed by this project's own SQL table names,
// e.g. "AuditLogs") — it is not cross-compatible with a backup exported from the old Next.js/
// Prisma/SQLite app, since the underlying schema and types (Float -> decimal, etc.) changed too.
[ApiController]
[Route("api/settings/backup")]
public class BackupController(SqlConnectionFactory connectionFactory, AuditService audit, BackupService backups) : ControllerBase
{
    private static readonly string[] TablesChildToParent = BackupService.TablesChildToParent;

    [HttpGet("export")]
    [RequirePermission("SETTINGS", "EXPORT")]
    public async Task<IActionResult> Export()
    {
        var session = HttpContext.GetSession()!;
        var json2 = await backups.ExportJsonAsync();

        await audit.LogAsync(session.UserId, "EXPORT", "SETTINGS", recordLabel: "Backup Export");

        var fileName = $"billing-erp-backup-{DateTime.UtcNow:yyyy-MM-dd}.json";
        return File(Encoding.UTF8.GetBytes(json2), "application/json", fileName);
    }

    [HttpPost("restore")]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Restore([FromBody] JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("data", out var dataElement) || dataElement.ValueKind != JsonValueKind.Object)
            return BadRequest(new { error = "Invalid backup file." });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction();

        try
        {
            foreach (var table in TablesChildToParent)
            {
                await connection.ExecuteAsync(
                    "dbo.sp_Backup_ClearTable", new { TableName = table }, transaction,
                    commandTimeout: 60, commandType: CommandType.StoredProcedure);
            }

            foreach (var table in TablesChildToParent.Reverse())
            {
                if (!dataElement.TryGetProperty(table, out var rows) || rows.GetArrayLength() == 0) continue;
                var rowsJson = rows.GetRawText();
                await connection.ExecuteAsync(
                    "dbo.sp_Backup_ImportTable", new { TableName = table, RowsJson = rowsJson }, transaction,
                    commandTimeout: 60, commandType: CommandType.StoredProcedure);
            }

            transaction.Commit();
        }
        catch (Exception ex)
        {
            transaction.Rollback();
            return StatusCode(500, new { error = ex.Message });
        }

        await audit.LogAsync(session.UserId, "RESTORE", "SETTINGS", recordLabel: "Backup Restore");

        return Ok(new { ok = true });
    }

    // ---- Automatic backups (folder on the server) ----

    [HttpGet("auto")]
    [RequirePermission("SETTINGS", "VIEW")]
    public IActionResult AutoStatus() => Ok(new
    {
        enabled = backups.AutoEnabled,
        directory = backups.Directory,
        runAtHour = backups.RunAtHour,
        keepCount = backups.KeepCount,
        files = backups.ListBackups().Select(f => new { name = f.Name, sizeBytes = f.SizeBytes, createdAt = f.CreatedAt }),
    });

    [HttpPost("auto/run")]
    [RequirePermission("SETTINGS", "EXPORT")]
    public async Task<IActionResult> RunNow()
    {
        var session = HttpContext.GetSession()!;
        try
        {
            var file = await backups.WriteBackupFileAsync();
            await audit.LogAsync(session.UserId, "EXPORT", "SETTINGS", recordLabel: $"Backup saved to folder: {file.Name}");
            return Ok(new { name = file.Name, sizeBytes = file.SizeBytes, createdAt = file.CreatedAt });
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return StatusCode(500, new { error = $"Could not write to the backup folder: {ex.Message}" });
        }
    }

    [HttpGet("auto/files/{name}")]
    [RequirePermission("SETTINGS", "EXPORT")]
    public IActionResult DownloadFile(string name)
    {
        var path = backups.ResolveBackupPath(name);
        if (path is null) return NotFound(new { error = "Backup not found" });
        return PhysicalFile(path, "application/json", name);
    }
}
