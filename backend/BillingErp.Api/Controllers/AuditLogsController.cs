using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Read-only viewer for the audit trail written by AuditService.LogAsync (sp_Audit_Log).
[ApiController]
[Route("api/audit-logs")]
public class AuditLogsController(SqlConnectionFactory connectionFactory) : ControllerBase
{
    private const int MaxRows = 2000;

    private record AuditRow(int Id, DateTime CreatedAt, int? UserId, string? UserName, string? UserEmail,
        string Action, string Module, int? RecordId, string? RecordLabel, string? IpAddress);

    private record FacetRow(string Kind, string Value);

    [HttpGet]
    [RequirePermission("SETTINGS", "VIEW")]
    public async Task<IActionResult> List([FromQuery] string? from, [FromQuery] string? to, [FromQuery] string? module,
        [FromQuery] int? userId, [FromQuery] string? action)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        // AuditLogs.CreatedAt is stored in UTC (SYSUTCDATETIME); the range arrives as local dates.
        var offset = TimeZoneInfo.Local.GetUtcOffset(DateTime.Now);
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Audit_List", new
        {
            From = f - offset,
            To = t - offset,
            Module = string.IsNullOrWhiteSpace(module) ? null : module,
            UserId = userId,
            Action = string.IsNullOrWhiteSpace(action) ? null : action,
            MaxRows,
        }, commandType: CommandType.StoredProcedure);
        var rows = (await multi.ReadAsync<AuditRow>()).ToList();
        var facets = (await multi.ReadAsync<FacetRow>()).ToList();

        return Ok(new
        {
            truncated = rows.Count >= MaxRows,
            modules = facets.Where(x => x.Kind == "MODULE").Select(x => x.Value).Order(),
            actions = facets.Where(x => x.Kind == "ACTION").Select(x => x.Value).Order(),
            rows = rows.Select(r => new
            {
                id = r.Id,
                // Tag as UTC so the browser converts it to local time.
                createdAt = DateTime.SpecifyKind(r.CreatedAt, DateTimeKind.Utc),
                userId = r.UserId, userName = r.UserName ?? "System", userEmail = r.UserEmail,
                action = r.Action, module = r.Module, recordId = r.RecordId, recordLabel = r.RecordLabel, ipAddress = r.IpAddress,
            }),
        });
    }
}
