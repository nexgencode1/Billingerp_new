using System.Data;
using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/manufacturing/production-orders/route.ts and [id]/complete/route.ts.
// All data access via sp_ProductionOrder_*/sp_Bom_*/sp_Stock_*.
[ApiController]
[RequirePlanFeature("MANUFACTURING")]
[Route("api/manufacturing/production-orders")]
public class ProductionOrdersController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record OrderRow(
        int Id, string OrderNumber, int ProductId, string ProductName, string ProductSku,
        decimal Quantity, string Status, DateTime? StartDate, DateTime? EndDate, string? Notes,
        int CreatedById, string CreatedByName, DateTime CreatedAt);

    private record BomComponentRow(int Id, int FinishedProductId, int ComponentProductId, string ComponentProductName, decimal Quantity);

    private static object ToJson(OrderRow r) => new
    {
        id = r.Id,
        orderNumber = r.OrderNumber,
        productId = r.ProductId,
        product = new { name = r.ProductName, sku = r.ProductSku },
        quantity = r.Quantity,
        status = r.Status,
        startDate = r.StartDate,
        endDate = r.EndDate,
        notes = r.Notes,
        createdById = r.CreatedById,
        createdBy = new { name = r.CreatedByName },
        createdAt = r.CreatedAt,
    };

    [HttpGet]
    [RequirePermission("MANUFACTURING", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<OrderRow>("dbo.sp_ProductionOrder_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(ToJson));
    }

    [HttpPost]
    [RequirePermission("MANUFACTURING", "CREATE")]
    public async Task<IActionResult> Create([FromBody] ProductionOrderCreateRequest? body)
    {
        if (body is null || body.Quantity <= 0)
            return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var bom = (await connection.QueryAsync<BomComponentRow>(
            "dbo.sp_Bom_ListByFinishedProduct", new { FinishedProductId = body.ProductId },
            commandType: CommandType.StoredProcedure)).ToList();
        if (bom.Count == 0)
            return BadRequest(new { error = "No Bill of Materials defined for this product." });

        var parameters = new DynamicParameters();
        parameters.Add("ProductId", body.ProductId);
        parameters.Add("Quantity", body.Quantity);
        parameters.Add("Notes", body.Notes);
        parameters.Add("CreatedById", session.UserId);
        parameters.Add("OrderId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("OrderNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);

        await connection.ExecuteAsync("dbo.sp_ProductionOrder_Create", parameters, commandType: CommandType.StoredProcedure);
        var newId = parameters.Get<int>("OrderId");

        var created = await connection.QuerySingleAsync<OrderRow>(
            "dbo.sp_ProductionOrder_GetById", new { OrderId = newId }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "CREATE", "MANUFACTURING", created.Id, created.OrderNumber);

        return StatusCode(201, ToJson(created));
    }

    [HttpPost("{id:int}/complete")]
    [RequirePermission("MANUFACTURING", "EDIT")]
    public async Task<IActionResult> Complete(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var order = await connection.QuerySingleOrDefaultAsync<OrderRow>(
            "dbo.sp_ProductionOrder_GetById", new { OrderId = id }, commandType: CommandType.StoredProcedure);
        if (order is null) return NotFound(new { error = "Production order not found" });
        if (order.Status == "COMPLETED")
            return BadRequest(new { error = "This production order is already completed." });

        var bom = (await connection.QueryAsync<BomComponentRow>(
            "dbo.sp_Bom_ListByFinishedProduct", new { FinishedProductId = order.ProductId },
            commandType: CommandType.StoredProcedure)).ToList();
        if (bom.Count == 0)
            return BadRequest(new { error = "No Bill of Materials defined for this product." });

        // BOM explosion: each component's per-unit Quantity multiplied by the order's Quantity.
        var requirements = bom.Select(b => new
        {
            b.ComponentProductId,
            b.ComponentProductName,
            Required = b.Quantity * order.Quantity,
        }).ToList();

        foreach (var req in requirements)
        {
            var balance = await connection.ExecuteScalarAsync<decimal>(
                "dbo.sp_Stock_GetBalance", new { ProductId = req.ComponentProductId }, commandType: CommandType.StoredProcedure);
            if (balance < req.Required)
            {
                return BadRequest(new
                {
                    error = $"Insufficient stock for component \"{req.ComponentProductName}\". Required: {req.Required}, Available: {balance}",
                });
            }
        }

        var componentsJson = JsonSerializer.Serialize(requirements.Select(r => new
        {
            componentProductId = r.ComponentProductId,
            required = r.Required,
        }));

        var parameters = new DynamicParameters();
        parameters.Add("OrderId", id);
        parameters.Add("ComponentsJson", componentsJson);
        parameters.Add("CreatedById", session.UserId);
        parameters.Add("NotFound", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        parameters.Add("AlreadyCompleted", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        parameters.Add("OrderNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
        parameters.Add("ProductId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("Quantity", dbType: DbType.Decimal, direction: ParameterDirection.Output, precision: 18, scale: 2);

        await connection.ExecuteAsync("dbo.sp_ProductionOrder_Complete", parameters, commandType: CommandType.StoredProcedure);

        if (parameters.Get<bool>("NotFound")) return NotFound(new { error = "Production order not found" });
        if (parameters.Get<bool>("AlreadyCompleted"))
            return BadRequest(new { error = "This production order is already completed." });

        var orderNumber = parameters.Get<string>("OrderNumber");
        await audit.LogAsync(session.UserId, "COMPLETE", "MANUFACTURING", id, orderNumber);

        return Ok(new { ok = true });
    }
}
