using System.Data;
using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Estimate/Quotation, Sale Order, Delivery Challan. Conversion to an invoice goes through the
// normal POST /api/sales with `sourceDocumentId` (see sp_Sale_Create), so the invoice keeps all of
// its usual rules (stock check, GST, numbering, payments) and the document is marked CONVERTED in
// the same transaction.
[ApiController]
[Route("api/sales-documents")]
public class SalesDocumentsController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private static readonly HashSet<string> DocTypes = ["ESTIMATE", "SALE_ORDER", "DELIVERY_CHALLAN"];

    private static readonly Dictionary<string, string> Labels = new()
    {
        ["ESTIMATE"] = "Estimate", ["SALE_ORDER"] = "Sale Order", ["DELIVERY_CHALLAN"] = "Delivery Challan",
    };

    private record DocumentRow(
        int Id, string DocType, string DocNumber, DateTime DocDate, DateTime? DueDate, int? CustomerId,
        decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal,
        string Status, int? ConvertedSaleId, string? ConvertedInvoiceNumber, string? Notes,
        int CreatedById, string CreatedByName, DateTime CreatedAt);

    private record DocumentListRow(
        int Id, string DocType, string DocNumber, DateTime DocDate, DateTime? DueDate, int? CustomerId, string? CustomerName,
        decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal,
        string Status, int? ConvertedSaleId, string? ConvertedInvoiceNumber, string? Notes,
        int CreatedById, string CreatedByName, DateTime CreatedAt, int ItemCount);

    private record CustomerRow(int Id, string Name, string Mobile, string? Email, string? Address, string? City, string? State, string? Pincode, string? Gstin);

    private record ItemRow(
        int Id, int ProductId, string ProductName, decimal Quantity, decimal Rate, decimal Discount, decimal GstRate,
        decimal TaxableAmount, decimal GstAmount, decimal Total, string Sku, string? HsnCode, string UnitName,
        string? UnitShortName, decimal CurrentStock);

    [HttpGet]
    [RequirePermission("SALES", "VIEW")]
    public async Task<IActionResult> List([FromQuery] string? type, [FromQuery] string? from, [FromQuery] string? to,
        [FromQuery] string? status, [FromQuery] int? customerId)
    {
        var docType = type?.Trim().ToUpperInvariant();
        if (docType is null || !DocTypes.Contains(docType)) return BadRequest(new { error = "Unknown document type" });

        DateTime? f = null, t = null;
        if (!string.IsNullOrWhiteSpace(from) || !string.IsNullOrWhiteSpace(to))
            (f, t) = ReportDateRange.Parse(string.IsNullOrWhiteSpace(from) ? null : from, string.IsNullOrWhiteSpace(to) ? null : to);

        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<DocumentListRow>("dbo.sp_SalesDocument_List", new
        {
            DocType = docType, From = f, To = t,
            Status = string.IsNullOrWhiteSpace(status) ? null : status.Trim().ToUpperInvariant(),
            CustomerId = customerId,
        }, commandType: CommandType.StoredProcedure);

        return Ok(rows.Select(r => new
        {
            id = r.Id, docType = r.DocType, docNumber = r.DocNumber, docDate = r.DocDate, dueDate = r.DueDate,
            customerId = r.CustomerId, customer = r.CustomerId is null ? null : new { id = r.CustomerId, name = r.CustomerName },
            subtotal = r.Subtotal, discount = r.Discount, taxableAmount = r.TaxableAmount, cgst = r.Cgst, sgst = r.Sgst,
            igst = r.Igst, grandTotal = r.GrandTotal, status = r.Status, convertedSaleId = r.ConvertedSaleId,
            convertedInvoiceNumber = r.ConvertedInvoiceNumber, notes = r.Notes, createdBy = new { name = r.CreatedByName },
            createdAt = r.CreatedAt, itemCount = r.ItemCount,
        }));
    }

    [HttpGet("{id:int}")]
    [RequirePermission("SALES", "VIEW")]
    public async Task<IActionResult> GetById(int id)
    {
        using var connection = connectionFactory.Create();
        var result = await LoadAsync(connection, id);
        return result is null ? NotFound(new { error = "Document not found" }) : Ok(result);
    }

    [HttpPost]
    [RequirePermission("SALES", "CREATE")]
    public async Task<IActionResult> Create([FromBody] SalesDocumentCreateRequest? body)
    {
        var docType = body?.DocType?.Trim().ToUpperInvariant();
        if (body is null || docType is null || !DocTypes.Contains(docType))
            return BadRequest(new { error = "Unknown document type" });
        if (body.Items is null || body.Items.Count == 0)
            return BadRequest(new { error = "Add at least one product" });
        foreach (var item in body.Items)
        {
            if (item.Quantity <= 0) return BadRequest(new { error = "Quantity must be greater than 0" });
            if (item.Rate < 0 || (item.Discount ?? 0) < 0) return BadRequest(new { error = "Invalid input" });
        }
        if (body.DueDate is not null && body.DueDate.Value.Date < body.DocDate.Date)
            return BadRequest(new { error = "Valid-until / delivery date can't be before the document date" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var ctx = new DynamicParameters();
        ctx.Add("CustomerId", body.CustomerId);
        ctx.Add("BusinessState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctx.Add("CustomerExists", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Sale_PrepareContext", ctx, commandType: CommandType.StoredProcedure);
        if (body.CustomerId is not null && !ctx.Get<bool>("CustomerExists"))
            return NotFound(new { error = "Customer not found" });

        var businessState = ctx.Get<string?>("BusinessState");
        var customerState = ctx.Get<string?>("CustomerState");
        var isInterstate = !string.IsNullOrEmpty(businessState) && !string.IsNullOrEmpty(customerState)
            && !string.Equals(businessState, customerState, StringComparison.OrdinalIgnoreCase);

        var totals = GstService.ComputeInvoiceTotals(
            body.Items.Select(i => new LineItemInput(i.Quantity, i.Rate, i.Discount ?? 0, i.GstRate ?? 0)), isInterstate);

        var itemsJson = JsonSerializer.Serialize(body.Items.Select((i, idx) => new
        {
            productId = i.ProductId, productName = i.ProductName,
            quantity = totals.Items[idx].Quantity, rate = totals.Items[idx].Rate, discount = totals.Items[idx].Discount,
            gstRate = totals.Items[idx].GstRate, taxableAmount = totals.Items[idx].TaxableAmount,
            gstAmount = totals.Items[idx].GstAmount, total = totals.Items[idx].Total,
        }));

        var p = new DynamicParameters();
        p.Add("DocType", docType);
        p.Add("DocDate", body.DocDate);
        p.Add("DueDate", body.DueDate);
        p.Add("CustomerId", body.CustomerId);
        p.Add("Subtotal", totals.Subtotal);
        p.Add("Discount", totals.Discount);
        p.Add("TaxableAmount", totals.TaxableAmount);
        p.Add("Cgst", totals.Cgst);
        p.Add("Sgst", totals.Sgst);
        p.Add("Igst", totals.Igst);
        p.Add("GrandTotal", totals.GrandTotal);
        p.Add("Notes", string.IsNullOrWhiteSpace(body.Notes) ? null : body.Notes.Trim());
        p.Add("ItemsJson", itemsJson);
        p.Add("CreatedById", session.UserId);
        p.Add("DocumentId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("DocNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);
        await connection.ExecuteAsync("dbo.sp_SalesDocument_Create", p, commandType: CommandType.StoredProcedure);

        var id = p.Get<int>("DocumentId");
        await audit.LogAsync(session.UserId, "CREATE", "SALES", id, $"{Labels[docType]} {p.Get<string>("DocNumber")}");

        return StatusCode(201, await LoadAsync(connection, id));
    }

    [HttpPost("{id:int}/cancel")]
    [RequirePermission("SALES", "EDIT")]
    public async Task<IActionResult> Cancel(int id)
    {
        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("DocumentId", id);
        p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_SalesDocument_Cancel", p, commandType: CommandType.StoredProcedure);

        switch (p.Get<int>("Result"))
        {
            case 1: return NotFound(new { error = "Document not found" });
            case 2: return BadRequest(new { error = "Only an open document can be cancelled" });
        }
        await audit.LogAsync(session.UserId, "CANCEL", "SALES", id);
        return Ok(await LoadAsync(connection, id));
    }

    private static async Task<object?> LoadAsync(IDbConnection connection, int id)
    {
        using var multi = await connection.QueryMultipleAsync("dbo.sp_SalesDocument_GetById", new { DocumentId = id }, commandType: CommandType.StoredProcedure);
        var d = await multi.ReadSingleOrDefaultAsync<DocumentRow>();
        if (d is null) return null;
        var customer = await multi.ReadSingleOrDefaultAsync<CustomerRow>();
        var items = (await multi.ReadAsync<ItemRow>()).ToList();

        return new
        {
            id = d.Id, docType = d.DocType, docLabel = Labels.GetValueOrDefault(d.DocType, d.DocType), docNumber = d.DocNumber,
            docDate = d.DocDate, dueDate = d.DueDate, customerId = d.CustomerId,
            customer = customer is null ? null : new
            {
                id = customer.Id, name = customer.Name, mobile = customer.Mobile, email = customer.Email, address = customer.Address,
                city = customer.City, state = customer.State, pincode = customer.Pincode, gstin = customer.Gstin,
            },
            subtotal = d.Subtotal, discount = d.Discount, taxableAmount = d.TaxableAmount, cgst = d.Cgst, sgst = d.Sgst,
            igst = d.Igst, grandTotal = d.GrandTotal, status = d.Status, convertedSaleId = d.ConvertedSaleId,
            convertedInvoiceNumber = d.ConvertedInvoiceNumber, notes = d.Notes, createdBy = new { name = d.CreatedByName },
            createdAt = d.CreatedAt,
            items = items.Select(i => new
            {
                id = i.Id, productId = i.ProductId, productName = i.ProductName, quantity = i.Quantity, rate = i.Rate,
                discount = i.Discount, gstRate = i.GstRate, taxableAmount = i.TaxableAmount, gstAmount = i.GstAmount,
                total = i.Total, sku = i.Sku, hsnCode = i.HsnCode, unitLabel = i.UnitShortName ?? i.UnitName,
                currentStock = i.CurrentStock,
            }),
        };
    }
}
