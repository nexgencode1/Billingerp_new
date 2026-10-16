using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/hr/attendance/route.ts. All data access via sp_Attendance_*.
// The original route never calls logAudit — preserved as-is.
[ApiController]
[RequirePlanFeature("HR")]
[Route("api/hr/attendance")]
public class AttendanceController(SqlConnectionFactory connectionFactory) : ControllerBase
{
    private static readonly HashSet<string> ValidStatuses = new(StringComparer.Ordinal)
    {
        "PRESENT", "ABSENT", "LEAVE", "HALF_DAY",
    };

    private record AttendanceListRow(
        int Id, int EmployeeId, string EmployeeName, string? EmployeeDesignation,
        DateTime Date, string Status, string? CheckIn, string? CheckOut, string? Note);

    private record AttendanceRow(
        int Id, int EmployeeId, DateTime Date, string Status, string? CheckIn, string? CheckOut, string? Note);

    private static object ToListJson(AttendanceListRow r) => new
    {
        id = r.Id,
        employeeId = r.EmployeeId,
        employee = new { name = r.EmployeeName, designation = r.EmployeeDesignation },
        date = r.Date,
        status = r.Status,
        checkIn = r.CheckIn,
        checkOut = r.CheckOut,
        note = r.Note,
    };

    private static object ToJson(AttendanceRow r) => new
    {
        id = r.Id,
        employeeId = r.EmployeeId,
        date = r.Date,
        status = r.Status,
        checkIn = r.CheckIn,
        checkOut = r.CheckOut,
        note = r.Note,
    };

    [HttpGet]
    [RequirePermission("HR", "VIEW")]
    public async Task<IActionResult> List([FromQuery] string? date)
    {
        DateTime? dateFilter = string.IsNullOrEmpty(date) ? null : DateTime.Parse(date);

        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<AttendanceListRow>(
            "dbo.sp_Attendance_List", new { Date = dateFilter }, commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToListJson));
    }

    [HttpPost]
    [RequirePermission("HR", "CREATE")]
    public async Task<IActionResult> Upsert([FromBody] AttendanceUpsertRequest? body)
    {
        if (body is null || body.EmployeeId <= 0 || string.IsNullOrWhiteSpace(body.Date)
            || string.IsNullOrWhiteSpace(body.Status) || !ValidStatuses.Contains(body.Status))
        {
            return BadRequest(new { error = "Invalid input" });
        }

        using var connection = connectionFactory.Create();
        var record = await connection.QuerySingleAsync<AttendanceRow>("dbo.sp_Attendance_Upsert", new
        {
            body.EmployeeId,
            Date = DateTime.Parse(body.Date),
            body.Status,
            body.CheckIn,
            body.CheckOut,
            body.Note,
        }, commandType: CommandType.StoredProcedure);

        return StatusCode(201, ToJson(record));
    }
}
