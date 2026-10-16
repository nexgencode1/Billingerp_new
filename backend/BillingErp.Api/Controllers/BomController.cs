using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/manufacturing/bom/route.ts and [id]/route.ts. All data access via sp_Bom_*.
[ApiController]
[RequirePlanFeature("MANUFACTURING")]
[Route("api/manufacturing/bom")]
public class BomController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record BomRow(
        int Id, int FinishedProductId, string FinishedProductName, string FinishedProductSku,
        int ComponentProductId, string ComponentProductName, string ComponentProductSku,
        string ComponentUnitName, string? ComponentUnitShortName, decimal Quantity);

    private static object ToJson(BomRow r) => new
    {
        id = r.Id,
        finishedProductId = r.FinishedProductId,
        finishedProduct = new { name = r.FinishedProductName, sku = r.FinishedProductSku },
        componentProductId = r.ComponentProductId,
        componentProduct = new
        {
            name = r.ComponentProductName,
            sku = r.ComponentProductSku,
            unit = new { name = r.ComponentUnitName, shortName = r.ComponentUnitShortName },
        },
        quantity = r.Quantity,
    };

    [HttpGet]
    [RequirePermission("MANUFACTURING", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<BomRow>("dbo.sp_Bom_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToJson));
    }

    [HttpPost]
    [RequirePermission("MANUFACTURING", "CREATE")]
    public async Task<IActionResult> Create([FromBody] BomCreateRequest? body)
    {
        if (body is null || body.Quantity <= 0)
            return BadRequest(new { error = "Invalid input" });
        if (body.FinishedProductId == body.ComponentProductId)
            return BadRequest(new { error = "A product cannot be a component of itself." });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var pairExists = await connection.ExecuteScalarAsync<bool>("dbo.sp_Bom_PairExists", new
        {
            body.FinishedProductId,
            body.ComponentProductId,
        }, commandType: CommandType.StoredProcedure);
        if (pairExists) return BadRequest(new { error = "This component is already part of the BOM." });

        var parameters = new DynamicParameters();
        parameters.Add("FinishedProductId", body.FinishedProductId);
        parameters.Add("ComponentProductId", body.ComponentProductId);
        parameters.Add("Quantity", body.Quantity);
        parameters.Add("BOMItemId", dbType: DbType.Int32, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_Bom_Create", parameters, commandType: CommandType.StoredProcedure);
        var newId = parameters.Get<int>("BOMItemId");

        var created = await connection.QuerySingleAsync<BomRow>(
            "dbo.sp_Bom_GetById", new { BOMItemId = newId }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "CREATE", "MANUFACTURING", created.Id);

        return StatusCode(201, ToJson(created));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("MANUFACTURING", "DELETE")]
    public async Task<IActionResult> Delete(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("BOMItemId", id);
        parameters.Add("Found", dbType: DbType.Boolean, direction: ParameterDirection.Output);

        await connection.ExecuteAsync("dbo.sp_Bom_Delete", parameters, commandType: CommandType.StoredProcedure);
        if (!parameters.Get<bool>("Found")) return NotFound(new { error = "BOM item not found" });

        await audit.LogAsync(session.UserId, "DELETE", "MANUFACTURING", id);

        return Ok(new { ok = true });
    }
}
