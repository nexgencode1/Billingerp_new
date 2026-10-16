using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/crm/leads/route.ts, [id]/route.ts, [id]/activities/route.ts.
// All data access via sp_Lead_*/sp_LeadActivity_*.
[ApiController]
[RequirePlanFeature("CRM")]
[Route("api/crm/leads")]
public class LeadsController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record LeadListRow(
        int Id, string Name, string? Mobile, string? Email, string? Source, string Status,
        int? AssignedToId, string? AssignedToName, string? Notes, DateTime CreatedAt, DateTime UpdatedAt,
        int ActivityCount);

    private record LeadRow(
        int Id, string Name, string? Mobile, string? Email, string? Source, string Status,
        int? AssignedToId, string? AssignedToName, string? Notes, DateTime CreatedAt, DateTime UpdatedAt);

    private record ActivityRow(
        int Id, int LeadId, string Note, DateTime? NextFollowUpDate, int CreatedById, string CreatedByName, DateTime CreatedAt);

    private static object ToListJson(LeadListRow r) => new
    {
        id = r.Id,
        name = r.Name,
        mobile = r.Mobile,
        email = r.Email,
        source = r.Source,
        status = r.Status,
        assignedToId = r.AssignedToId,
        assignedTo = r.AssignedToId is null ? null : new { name = r.AssignedToName },
        notes = r.Notes,
        createdAt = r.CreatedAt,
        updatedAt = r.UpdatedAt,
        _count = new { activities = r.ActivityCount },
    };

    private static object ToActivityJson(ActivityRow a) => new
    {
        id = a.Id,
        leadId = a.LeadId,
        note = a.Note,
        nextFollowUpDate = a.NextFollowUpDate,
        createdById = a.CreatedById,
        createdBy = new { name = a.CreatedByName },
        createdAt = a.CreatedAt,
    };

    private static object ToLeadJson(LeadRow r) => new
    {
        id = r.Id,
        name = r.Name,
        mobile = r.Mobile,
        email = r.Email,
        source = r.Source,
        status = r.Status,
        assignedToId = r.AssignedToId,
        assignedTo = r.AssignedToId is null ? null : new { name = r.AssignedToName },
        notes = r.Notes,
        createdAt = r.CreatedAt,
        updatedAt = r.UpdatedAt,
    };

    private static object ToDetailJson(LeadRow r, List<ActivityRow> activities) => new
    {
        id = r.Id,
        name = r.Name,
        mobile = r.Mobile,
        email = r.Email,
        source = r.Source,
        status = r.Status,
        assignedToId = r.AssignedToId,
        assignedTo = r.AssignedToId is null ? null : new { name = r.AssignedToName },
        notes = r.Notes,
        createdAt = r.CreatedAt,
        updatedAt = r.UpdatedAt,
        activities = activities.Select(ToActivityJson),
    };

    [HttpGet]
    [RequirePermission("CRM", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<LeadListRow>("dbo.sp_Lead_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToListJson));
    }

    [HttpGet("{id:int}")]
    [RequirePermission("CRM", "VIEW")]
    public async Task<IActionResult> GetById(int id)
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Lead_GetById", new { LeadId = id }, commandType: CommandType.StoredProcedure);
        var lead = await multi.ReadSingleOrDefaultAsync<LeadRow>();
        if (lead is null) return NotFound(new { error = "Lead not found" });
        var activities = (await multi.ReadAsync<ActivityRow>()).ToList();
        return Ok(ToDetailJson(lead, activities));
    }

    [HttpPost]
    [RequirePermission("CRM", "CREATE")]
    public async Task<IActionResult> Create([FromBody] LeadCreateRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "Lead name is required" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("Name", body.Name);
        parameters.Add("Mobile", body.Mobile);
        parameters.Add("Email", body.Email);
        parameters.Add("Source", body.Source);
        parameters.Add("Status", string.IsNullOrEmpty(body.Status) ? "NEW" : body.Status);
        parameters.Add("AssignedToId", body.AssignedToId);
        parameters.Add("Notes", body.Notes);
        parameters.Add("LeadId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_Lead_Create", parameters, commandType: CommandType.StoredProcedure);
        var newId = parameters.Get<int>("LeadId");

        var created = await connection.QuerySingleAsync<LeadRow>(
            "dbo.sp_Lead_GetById", new { LeadId = newId }, commandType: CommandType.StoredProcedure);
        // sp_Lead_GetById returns two result sets; QuerySingleAsync only reads the first (the lead
        // header), which is exactly what's needed here — Dapper stops after the first grid.

        await audit.LogAsync(session.UserId, "CREATE", "CRM", created.Id, created.Name);

        return StatusCode(201, ToLeadJson(created));
    }

    [HttpPatch("{id:int}")]
    [RequirePermission("CRM", "EDIT")]
    public async Task<IActionResult> Update(int id, [FromBody] LeadUpdateRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });
        if (body.Name is not null && body.Name.Trim().Length == 0)
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        await connection.ExecuteAsync("dbo.sp_Lead_Update", new
        {
            LeadId = id,
            body.Name,
            body.Mobile,
            body.Email,
            body.Source,
            body.Status,
            body.AssignedToId,
            body.Notes,
        }, commandType: CommandType.StoredProcedure);

        var updated = await connection.QuerySingleOrDefaultAsync<LeadRow>(
            "dbo.sp_Lead_GetById", new { LeadId = id }, commandType: CommandType.StoredProcedure);
        if (updated is null) return NotFound(new { error = "Lead not found" });

        await audit.LogAsync(session.UserId, "UPDATE", "CRM", updated.Id, updated.Name);

        return Ok(ToLeadJson(updated));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("CRM", "DELETE")]
    public async Task<IActionResult> Delete(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("LeadId", id);
        parameters.Add("LeadName", dbType: DbType.String, direction: ParameterDirection.Output, size: 200);

        await connection.ExecuteAsync("dbo.sp_Lead_Delete", parameters, commandType: CommandType.StoredProcedure);
        var name = parameters.Get<string?>("LeadName");
        if (name is null) return NotFound(new { error = "Lead not found" });

        await audit.LogAsync(session.UserId, "DELETE", "CRM", id, name);

        return Ok(new { ok = true });
    }

    [HttpPost("{id:int}/activities")]
    [RequirePermission("CRM", "EDIT")]
    public async Task<IActionResult> AddActivity(int id, [FromBody] LeadActivityCreateRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Note))
            return BadRequest(new { error = "Note is required" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var leadExists = await connection.ExecuteScalarAsync<bool>(
            "dbo.sp_Lead_Exists", new { LeadId = id }, commandType: CommandType.StoredProcedure);
        if (!leadExists) return NotFound(new { error = "Lead not found" });

        DateTime? nextFollowUpDate = string.IsNullOrEmpty(body.NextFollowUpDate)
            ? null : DateTime.Parse(body.NextFollowUpDate);

        var parameters = new DynamicParameters();
        parameters.Add("LeadId", id);
        parameters.Add("Note", body.Note);
        parameters.Add("NextFollowUpDate", nextFollowUpDate);
        parameters.Add("CreatedById", session.UserId);
        parameters.Add("ActivityId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_LeadActivity_Create", parameters, commandType: CommandType.StoredProcedure);
        var newId = parameters.Get<int>("ActivityId");

        var created = await connection.QuerySingleAsync<ActivityRow>(
            "dbo.sp_LeadActivity_GetById", new { ActivityId = newId }, commandType: CommandType.StoredProcedure);

        // The original activities route doesn't call logAudit at all — preserved as-is.

        return StatusCode(201, ToActivityJson(created));
    }
}
