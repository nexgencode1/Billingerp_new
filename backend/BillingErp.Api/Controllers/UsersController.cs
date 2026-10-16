using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/users/route.ts and [id]/route.ts.
[ApiController]
[Route("api/users")]
public class UsersController(SqlConnectionFactory connectionFactory, AuditService audit, PlanAccessService planAccess) : ControllerBase
{
    private record UserRow(int Id, string Name, string Email, string? Mobile, bool Status, DateTime? LastLogin, int RoleId, string RoleName);

    private static object ToJson(UserRow r) => new
    {
        id = r.Id, name = r.Name, email = r.Email, mobile = r.Mobile, status = r.Status,
        lastLogin = r.LastLogin, roleId = r.RoleId, role = new { name = r.RoleName },
    };

    [HttpGet]
    [RequirePermission("USERS", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<UserRow>("dbo.sp_User_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToJson));
    }

    [HttpPost]
    [RequirePermission("USERS", "CREATE")]
    public async Task<IActionResult> Create([FromBody] UserCreateRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Name)) return BadRequest(new { error = "Name is required" });
        if (string.IsNullOrWhiteSpace(body.Email) || !body.Email.Contains('@')) return BadRequest(new { error = "Invalid email address" });
        if (string.IsNullOrEmpty(body.Password) || body.Password.Length < 6) return BadRequest(new { error = "Password must be at least 6 characters" });

        var planError = await planAccess.CheckNewUserAsync();
        if (planError is not null) return StatusCode(402, new { error = planError, code = "PLAN_LIMIT" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var email = body.Email.ToLowerInvariant();
        var exists = await connection.ExecuteScalarAsync<bool>(
            "dbo.sp_Auth_EmailExists", new { Email = email, ExcludeUserId = (int?)null }, commandType: CommandType.StoredProcedure);
        if (exists) return BadRequest(new { error = "A user with this email already exists." });

        var parameters = new DynamicParameters();
        parameters.Add("Name", body.Name);
        parameters.Add("Email", email);
        parameters.Add("Mobile", body.Mobile);
        parameters.Add("PasswordHash", PasswordHasher.Hash(body.Password));
        parameters.Add("RoleId", body.RoleId);
        parameters.Add("Status", body.Status ?? true);
        parameters.Add("UserId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_User_Create", parameters, commandType: CommandType.StoredProcedure);
        var userId = parameters.Get<int>("UserId");

        var created = await connection.QuerySingleAsync<UserRow>(
            "dbo.sp_User_GetById", new { UserId = userId }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "CREATE", "USERS", created.Id, created.Email);

        return StatusCode(201, ToJson(created));
    }

    [HttpPatch("{id:int}")]
    [RequirePermission("USERS", "EDIT")]
    public async Task<IActionResult> Update(int id, [FromBody] UserUpdateRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });
        if (body.Password is not null && body.Password.Length < 6) return BadRequest(new { error = "Password must be at least 6 characters" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var email = body.Email?.ToLowerInvariant();
        await connection.ExecuteAsync("dbo.sp_User_Update", new
        {
            UserId = id,
            body.Name,
            Email = email,
            MobileProvided = body.Mobile is not null,
            body.Mobile,
            PasswordHash = body.Password is not null ? PasswordHasher.Hash(body.Password) : null,
            body.RoleId,
            StatusProvided = body.Status.HasValue,
            Status = body.Status ?? false,
        }, commandType: CommandType.StoredProcedure);

        var updated = await connection.QuerySingleOrDefaultAsync<UserRow>(
            "dbo.sp_User_GetById", new { UserId = id }, commandType: CommandType.StoredProcedure);
        if (updated is null) return NotFound(new { error = "User not found" });

        await audit.LogAsync(session.UserId, "UPDATE", "USERS", updated.Id, updated.Email);

        return Ok(ToJson(updated));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("USERS", "DELETE")]
    public async Task<IActionResult> Deactivate(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var email = await connection.QuerySingleOrDefaultAsync<string?>(
            "dbo.sp_User_Deactivate", new { UserId = id }, commandType: CommandType.StoredProcedure);
        if (email is null) return NotFound(new { error = "User not found" });

        await audit.LogAsync(session.UserId, "DEACTIVATE", "USERS", id, email);

        return Ok(new { ok = true, deactivated = true });
    }
}
