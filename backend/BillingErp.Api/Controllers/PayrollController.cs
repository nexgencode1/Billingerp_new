using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/hr/payroll/route.ts, generate/route.ts, [id]/route.ts.
// All data access via sp_Payroll_*.
[ApiController]
[RequirePlanFeature("HR")]
[Route("api/hr/payroll")]
public class PayrollController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private static readonly HashSet<string> ValidStatuses = new(StringComparer.Ordinal) { "DRAFT", "PAID" };

    private record PayrollListRow(
        int Id, int EmployeeId, string EmployeeName, string? EmployeeDesignation,
        int Month, int Year, decimal Basic, decimal Allowances, decimal Deductions, decimal NetPay,
        string Status, DateTime? PaidDate, DateTime CreatedAt);

    private record PayrollRow(
        int Id, int EmployeeId, int Month, int Year, decimal Basic, decimal Allowances, decimal Deductions,
        decimal NetPay, string Status, DateTime? PaidDate, DateTime CreatedAt);

    private static object ToListJson(PayrollListRow r) => new
    {
        id = r.Id,
        employeeId = r.EmployeeId,
        employee = new { name = r.EmployeeName, designation = r.EmployeeDesignation },
        month = r.Month,
        year = r.Year,
        basic = r.Basic,
        allowances = r.Allowances,
        deductions = r.Deductions,
        netPay = r.NetPay,
        status = r.Status,
        paidDate = r.PaidDate,
        createdAt = r.CreatedAt,
    };

    private static object ToJson(PayrollRow r) => new
    {
        id = r.Id,
        employeeId = r.EmployeeId,
        month = r.Month,
        year = r.Year,
        basic = r.Basic,
        allowances = r.Allowances,
        deductions = r.Deductions,
        netPay = r.NetPay,
        status = r.Status,
        paidDate = r.PaidDate,
        createdAt = r.CreatedAt,
    };

    [HttpGet]
    [RequirePermission("HR", "VIEW")]
    public async Task<IActionResult> List([FromQuery] int? month, [FromQuery] int? year)
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<PayrollListRow>(
            "dbo.sp_Payroll_List", new { Month = month, Year = year }, commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToListJson));
    }

    [HttpPost("generate")]
    [RequirePermission("HR", "CREATE")]
    public async Task<IActionResult> Generate([FromBody] PayrollGenerateRequest? body)
    {
        if (body is null || body.Month is < 1 or > 12)
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("Month", body.Month);
        parameters.Add("Year", body.Year);
        parameters.Add("Created", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_Payroll_Generate", parameters, commandType: CommandType.StoredProcedure);
        var created = parameters.Get<int>("Created");

        await audit.LogAsync(session.UserId, "GENERATE", "HR", recordLabel: $"Payroll {body.Month}/{body.Year}");

        return Ok(new { ok = true, created });
    }

    [HttpPatch("{id:int}")]
    [RequirePermission("HR", "EDIT")]
    public async Task<IActionResult> Update(int id, [FromBody] PayrollUpdateRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });
        if (body.Allowances is < 0 || body.Deductions is < 0)
            return BadRequest(new { error = "Invalid input" });
        if (body.Status is not null && !ValidStatuses.Contains(body.Status))
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var existing = await connection.QuerySingleOrDefaultAsync<PayrollRow>(
            "dbo.sp_Payroll_GetById", new { PayrollId = id }, commandType: CommandType.StoredProcedure);
        if (existing is null) return NotFound(new { error = "Payroll record not found" });

        var allowances = body.Allowances ?? existing.Allowances;
        var deductions = body.Deductions ?? existing.Deductions;
        var netPay = existing.Basic + allowances - deductions;
        var status = body.Status ?? existing.Status;
        // Matches the original exactly: paidDate is only set to "now" when status is being
        // changed to PAID *in this request* — not merely because the record is already PAID.
        var paidDate = body.Status == "PAID" ? DateTime.UtcNow : existing.PaidDate;

        await connection.ExecuteAsync("dbo.sp_Payroll_Update", new
        {
            PayrollId = id,
            Allowances = allowances,
            Deductions = deductions,
            NetPay = netPay,
            Status = status,
            PaidDate = paidDate,
        }, commandType: CommandType.StoredProcedure);

        var updated = await connection.QuerySingleAsync<PayrollRow>(
            "dbo.sp_Payroll_GetById", new { PayrollId = id }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "UPDATE", "HR", updated.Id, "Payroll");

        return Ok(ToJson(updated));
    }
}
