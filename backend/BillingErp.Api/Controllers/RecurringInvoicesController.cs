using System.Data;
using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record RecurringSaveRequest(string? Name, int CustomerId, string? Frequency, DateTime StartDate, DateTime? EndDate,
    bool? IsActive, string? Notes, List<SaleItemInput>? Items);

[ApiController]
[Route("api/recurring-invoices")]
public class RecurringInvoicesController(SqlConnectionFactory connectionFactory, RecurringInvoiceService recurring, AuditService audit) : ControllerBase
{
    private static object ToJson(RecurringTemplateRow r) => new
    {
        id = r.Id, name = r.Name, customerId = r.CustomerId, customer = new { id = r.CustomerId, name = r.CustomerName },
        frequency = r.Frequency, startDate = r.StartDate, endDate = r.EndDate, nextRunDate = r.NextRunDate, isActive = r.IsActive,
        lastRunAt = r.LastRunAt is null ? (DateTime?)null : DateTime.SpecifyKind(r.LastRunAt.Value, DateTimeKind.Utc),
        lastSaleId = r.LastSaleId, lastInvoiceNumber = r.LastInvoiceNumber, lastError = r.LastError, runCount = r.RunCount,
        notes = r.Notes, itemCount = r.ItemCount, taxableValue = r.TaxableValue,
        items = r.Items.Select(i => new
        {
            productId = i.ProductId, productName = i.ProductName, quantity = i.Quantity, rate = i.Rate, discount = i.Discount, gstRate = i.GstRate,
        }),
    };

    [HttpGet]
    [RequirePermission("SALES", "VIEW")]
    public async Task<IActionResult> List() => Ok((await recurring.ListAsync()).Select(ToJson));

    [HttpPost]
    [RequirePermission("SALES", "CREATE")]
    public Task<IActionResult> Create([FromBody] RecurringSaveRequest? body) => Save(null, body);

    [HttpPut("{id:int}")]
    [RequirePermission("SALES", "EDIT")]
    public Task<IActionResult> Update(int id, [FromBody] RecurringSaveRequest? body) => Save(id, body);

    private async Task<IActionResult> Save(int? id, RecurringSaveRequest? body)
    {
        var name = body?.Name?.Trim();
        var frequency = body?.Frequency?.Trim().ToUpperInvariant() ?? "MONTHLY";
        if (body is null || string.IsNullOrEmpty(name)) return BadRequest(new { error = "Name is required" });
        if (!RecurringInvoiceService.Frequencies.Contains(frequency)) return BadRequest(new { error = "Unknown frequency" });
        if (body.Items is null || body.Items.Count == 0) return BadRequest(new { error = "Add at least one product" });
        if (body.Items.Any(i => i.Quantity <= 0 || i.Rate < 0 || (i.Discount ?? 0) < 0)) return BadRequest(new { error = "Invalid item quantity / rate" });
        if (body.EndDate is not null && body.EndDate.Value.Date < body.StartDate.Date) return BadRequest(new { error = "End date can't be before the start date" });

        // Next run: for a new template it's the start date; when editing keep the schedule position
        // (occurrence = RunCount) against the possibly changed start date / frequency.
        var existing = id is null ? null : (await recurring.ListAsync(id: id)).FirstOrDefault();
        if (id is not null && existing is null) return NotFound(new { error = "Recurring invoice not found" });
        var nextRun = RecurringInvoiceService.Occurrence(body.StartDate.Date, frequency, existing?.RunCount ?? 0);

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("RecurringId", id);
        p.Add("Name", name);
        p.Add("CustomerId", body.CustomerId);
        p.Add("Frequency", frequency);
        p.Add("StartDate", body.StartDate.Date);
        p.Add("EndDate", body.EndDate?.Date);
        p.Add("NextRunDate", nextRun);
        p.Add("IsActive", body.IsActive ?? true);
        p.Add("Notes", string.IsNullOrWhiteSpace(body.Notes) ? null : body.Notes.Trim());
        p.Add("ItemsJson", JsonSerializer.Serialize(body.Items.Select(i => new
        {
            productId = i.ProductId, productName = i.ProductName, quantity = i.Quantity, rate = i.Rate, discount = i.Discount ?? 0, gstRate = i.GstRate ?? 0,
        })));
        p.Add("CreatedById", session.UserId);
        p.Add("SavedId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Recurring_Save", p, commandType: CommandType.StoredProcedure);

        switch (p.Get<int>("Result"))
        {
            case 1: return NotFound(new { error = "Recurring invoice not found" });
            case 2: return NotFound(new { error = "Customer not found" });
        }
        var savedId = p.Get<int>("SavedId");
        await audit.LogAsync(session.UserId, id is null ? "CREATE" : "UPDATE", "SALES", savedId, $"Recurring: {name}");
        var saved = (await recurring.ListAsync(id: savedId)).First();
        return id is null ? StatusCode(201, ToJson(saved)) : Ok(ToJson(saved));
    }

    // Creates the next occurrence right now (dated today) and moves the schedule forward.
    [HttpPost("{id:int}/run")]
    [RequirePermission("SALES", "CREATE")]
    public async Task<IActionResult> RunNow(int id)
    {
        var template = (await recurring.ListAsync(id: id)).FirstOrDefault();
        if (template is null) return NotFound(new { error = "Recurring invoice not found" });
        if (!template.IsActive) return BadRequest(new { error = "This recurring invoice is paused" });

        var result = await recurring.RunOnceAsync(template, DateTime.Today, isAutomatic: false);
        if (!result.Success) return BadRequest(new { error = result.Error });
        return Ok(new { invoiceNumber = result.InvoiceNumber, recurring = ToJson((await recurring.ListAsync(id: id)).First()) });
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("SALES", "DELETE")]
    public async Task<IActionResult> Delete(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("RecurringId", id);
        p.Add("Deleted", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Recurring_Delete", p, commandType: CommandType.StoredProcedure);
        if (!p.Get<bool>("Deleted")) return NotFound(new { error = "Recurring invoice not found" });
        await audit.LogAsync(session.UserId, "DELETE", "SALES", id, "Recurring invoice");
        return Ok(new { success = true });
    }
}
