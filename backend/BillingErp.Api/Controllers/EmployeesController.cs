using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/hr/employees/route.ts and [id]/route.ts. All data access via sp_Employee_*.
[ApiController]
[RequirePlanFeature("HR")]
[Route("api/hr/employees")]
public class EmployeesController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record EmployeeRow(
        int Id, string Name, string? Designation, string? Department, string? Mobile, string? Email,
        DateTime JoiningDate, decimal Salary, bool Status, DateTime CreatedAt);

    private static object ToJson(EmployeeRow r) => new
    {
        id = r.Id,
        name = r.Name,
        designation = r.Designation,
        department = r.Department,
        mobile = r.Mobile,
        email = r.Email,
        joiningDate = r.JoiningDate,
        salary = r.Salary,
        status = r.Status,
        createdAt = r.CreatedAt,
    };

    [HttpGet]
    [RequirePermission("HR", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<EmployeeRow>("dbo.sp_Employee_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToJson));
    }

    [HttpPost]
    [RequirePermission("HR", "CREATE")]
    public async Task<IActionResult> Create([FromBody] EmployeeCreateRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "Name is required" });
        if (string.IsNullOrWhiteSpace(body.JoiningDate))
            return BadRequest(new { error = "Invalid input" });
        if (body.Salary < 0)
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("Name", body.Name);
        parameters.Add("Designation", body.Designation);
        parameters.Add("Department", body.Department);
        parameters.Add("Mobile", body.Mobile);
        parameters.Add("Email", body.Email);
        parameters.Add("JoiningDate", DateTime.Parse(body.JoiningDate));
        parameters.Add("Salary", body.Salary);
        parameters.Add("Status", body.Status ?? true);
        parameters.Add("EmployeeId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_Employee_Create", parameters, commandType: CommandType.StoredProcedure);
        var newId = parameters.Get<int>("EmployeeId");

        var created = await connection.QuerySingleAsync<EmployeeRow>(
            "dbo.sp_Employee_GetById", new { EmployeeId = newId }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "CREATE", "HR", created.Id, created.Name);

        return StatusCode(201, ToJson(created));
    }

    [HttpPatch("{id:int}")]
    [RequirePermission("HR", "EDIT")]
    public async Task<IActionResult> Update(int id, [FromBody] EmployeeUpdateRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });
        if (body.Name is not null && body.Name.Trim().Length == 0)
            return BadRequest(new { error = "Invalid input" });
        if (body.Salary is < 0)
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        await connection.ExecuteAsync("dbo.sp_Employee_Update", new
        {
            EmployeeId = id,
            body.Name,
            body.Designation,
            body.Department,
            body.Mobile,
            body.Email,
            JoiningDate = string.IsNullOrEmpty(body.JoiningDate) ? (DateTime?)null : DateTime.Parse(body.JoiningDate),
            body.Salary,
            StatusProvided = body.Status.HasValue,
            Status = body.Status ?? false,
        }, commandType: CommandType.StoredProcedure);

        var updated = await connection.QuerySingleOrDefaultAsync<EmployeeRow>(
            "dbo.sp_Employee_GetById", new { EmployeeId = id }, commandType: CommandType.StoredProcedure);
        if (updated is null) return NotFound(new { error = "Employee not found" });

        await audit.LogAsync(session.UserId, "UPDATE", "HR", updated.Id, updated.Name);

        return Ok(ToJson(updated));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("HR", "DELETE")]
    public async Task<IActionResult> Delete(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("EmployeeId", id);
        parameters.Add("EmployeeName", dbType: DbType.String, direction: ParameterDirection.Output, size: 200);

        await connection.ExecuteAsync("dbo.sp_Employee_Delete", parameters, commandType: CommandType.StoredProcedure);
        var name = parameters.Get<string?>("EmployeeName");
        if (name is null) return NotFound(new { error = "Employee not found" });

        await audit.LogAsync(session.UserId, "DEACTIVATE", "HR", id, name);

        return Ok(new { ok = true });
    }
}
