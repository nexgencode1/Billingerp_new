using System.Data;
using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/sales/route.ts, [id]/route.ts, [id]/cancel/route.ts.
// Create's response is a superset of the original (also includes createdBy name + payments,
// which the original's POST response omitted) — harmless extra fields, not a breaking change.
[ApiController]
[Route("api/sales")]
public class SalesController(SqlConnectionFactory connectionFactory, AuditService audit, SaleService sales) : ControllerBase
{
    private record SaleRow(
        int Id, string InvoiceNumber, DateTime InvoiceDate, int? CustomerId,
        decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst,
        decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string PaymentMethod,
        string Status, string? CancelReason, int CreatedById, DateTime CreatedAt);

    private record SaleListRow(
        int Id, string InvoiceNumber, DateTime InvoiceDate, int? CustomerId, string? CustomerName,
        decimal Subtotal, decimal Discount, decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst,
        decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string PaymentMethod,
        string Status, string? CancelReason, int CreatedById, string CreatedByName, DateTime CreatedAt);

    private record CustomerRow(
        int Id, string Name, string Mobile, string? Email, string? Address, string? City, string? State,
        string? Pincode, string? Gstin, string? Pan, decimal OpeningBalance, decimal? CreditLimit,
        string? PaymentTerms, string? Notes, bool Status, DateTime CreatedAt);

    private record SaleItemWithProductRow(
        int Id, int SaleId, int ProductId, string ProductName, decimal Quantity, decimal Rate, decimal Discount,
        decimal GstRate, decimal TaxableAmount, decimal GstAmount, decimal Total,
        int Product_Id, string Product_Name, string Product_Sku, string? Product_Barcode,
        int? Product_CategoryId, int? Product_BrandId, int Product_UnitId, string? Product_HsnCode,
        decimal Product_PurchasePrice, decimal Product_SellingPrice, decimal? Product_Mrp, decimal Product_GstRate,
        decimal Product_OpeningStock, decimal Product_MinimumStock, decimal? Product_MaximumStock,
        string? Product_Description, string? Product_Image, bool Product_Status,
        DateTime Product_CreatedAt, DateTime Product_UpdatedAt);

    private record PaymentRow(
        int Id, string PaymentNumber, string Direction, DateTime Date, decimal Amount, string Method,
        string? ReferenceNo, string? Notes, int? CustomerId, int? SupplierId, int? SaleId, int? PurchaseId,
        int CreatedById, DateTime CreatedAt);

    private static object ToCustomerJson(CustomerRow c) => new
    {
        id = c.Id, name = c.Name, mobile = c.Mobile, email = c.Email, address = c.Address, city = c.City,
        state = c.State, pincode = c.Pincode, gstin = c.Gstin, pan = c.Pan, openingBalance = c.OpeningBalance,
        creditLimit = c.CreditLimit, paymentTerms = c.PaymentTerms, notes = c.Notes, status = c.Status,
        createdAt = c.CreatedAt,
    };

    private static object ToItemJson(SaleItemWithProductRow i) => new
    {
        id = i.Id,
        saleId = i.SaleId,
        productId = i.ProductId,
        productName = i.ProductName,
        quantity = i.Quantity,
        rate = i.Rate,
        discount = i.Discount,
        gstRate = i.GstRate,
        taxableAmount = i.TaxableAmount,
        gstAmount = i.GstAmount,
        total = i.Total,
        product = new
        {
            id = i.Product_Id, name = i.Product_Name, sku = i.Product_Sku, barcode = i.Product_Barcode,
            categoryId = i.Product_CategoryId, brandId = i.Product_BrandId, unitId = i.Product_UnitId,
            hsnCode = i.Product_HsnCode, purchasePrice = i.Product_PurchasePrice, sellingPrice = i.Product_SellingPrice,
            mrp = i.Product_Mrp, gstRate = i.Product_GstRate, openingStock = i.Product_OpeningStock,
            minimumStock = i.Product_MinimumStock, maximumStock = i.Product_MaximumStock,
            description = i.Product_Description, image = i.Product_Image, status = i.Product_Status,
            createdAt = i.Product_CreatedAt, updatedAt = i.Product_UpdatedAt,
        },
    };

    private static object ToPaymentJson(PaymentRow p) => new
    {
        id = p.Id, paymentNumber = p.PaymentNumber, direction = p.Direction, date = p.Date, amount = p.Amount,
        method = p.Method, referenceNo = p.ReferenceNo, notes = p.Notes, customerId = p.CustomerId,
        supplierId = p.SupplierId, saleId = p.SaleId, purchaseId = p.PurchaseId, createdById = p.CreatedById,
        createdAt = p.CreatedAt,
    };

    private static object ToDetailJson(SaleRow s, CustomerRow? customer, string createdByName,
        List<SaleItemWithProductRow> items, List<PaymentRow> payments) => new
    {
        id = s.Id,
        invoiceNumber = s.InvoiceNumber,
        invoiceDate = s.InvoiceDate,
        customerId = s.CustomerId,
        customer = customer is null ? null : ToCustomerJson(customer),
        subtotal = s.Subtotal,
        discount = s.Discount,
        taxableAmount = s.TaxableAmount,
        cgst = s.Cgst,
        sgst = s.Sgst,
        igst = s.Igst,
        grandTotal = s.GrandTotal,
        paidAmount = s.PaidAmount,
        dueAmount = s.DueAmount,
        paymentStatus = s.PaymentStatus,
        paymentMethod = s.PaymentMethod,
        status = s.Status,
        cancelReason = s.CancelReason,
        createdById = s.CreatedById,
        createdBy = new { name = createdByName },
        createdAt = s.CreatedAt,
        items = items.Select(ToItemJson),
        payments = payments.Select(ToPaymentJson),
    };

    [HttpGet]
    [RequirePermission("SALES", "VIEW")]
    public async Task<IActionResult> List()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<SaleListRow>("dbo.sp_Sale_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(r => new
        {
            id = r.Id, invoiceNumber = r.InvoiceNumber, invoiceDate = r.InvoiceDate, customerId = r.CustomerId,
            customer = r.CustomerId is null ? null : new { id = r.CustomerId, name = r.CustomerName },
            subtotal = r.Subtotal, discount = r.Discount, taxableAmount = r.TaxableAmount, cgst = r.Cgst,
            sgst = r.Sgst, igst = r.Igst, grandTotal = r.GrandTotal, paidAmount = r.PaidAmount, dueAmount = r.DueAmount,
            paymentStatus = r.PaymentStatus, paymentMethod = r.PaymentMethod, status = r.Status,
            cancelReason = r.CancelReason, createdById = r.CreatedById,
            createdBy = new { name = r.CreatedByName }, createdAt = r.CreatedAt,
        }));
    }

    [HttpGet("{id:int}")]
    [RequirePermission("SALES", "VIEW")]
    public async Task<IActionResult> GetById(int id)
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Sale_GetById", new { SaleId = id }, commandType: CommandType.StoredProcedure);
        var sale = await multi.ReadSingleOrDefaultAsync<SaleRow>();
        if (sale is null) return NotFound(new { error = "Sale not found" });
        var customer = await multi.ReadSingleOrDefaultAsync<CustomerRow>();
        var createdByName = await multi.ReadSingleOrDefaultAsync<string>();
        var items = (await multi.ReadAsync<SaleItemWithProductRow>()).ToList();
        var payments = (await multi.ReadAsync<PaymentRow>()).ToList();

        return Ok(ToDetailJson(sale, customer, createdByName ?? "", items, payments));
    }

    [HttpPost]
    [RequirePermission("SALES", "CREATE")]
    public async Task<IActionResult> Create([FromBody] SaleCreateRequest? body)
    {
        var session = HttpContext.GetSession()!;
        var outcome = await sales.CreateAsync(body, session.UserId);
        if (!outcome.Ok)
            return outcome.ErrorStatus == 404 ? NotFound(new { error = outcome.Error }) : BadRequest(new { error = outcome.Error });

        var saleId = outcome.SaleId!.Value;
        var invoiceNumber = outcome.InvoiceNumber!;
        using var connection = connectionFactory.Create();

        await audit.LogAsync(session.UserId, "CREATE", "SALES", saleId, invoiceNumber);

        using var multi = await connection.QueryMultipleAsync("dbo.sp_Sale_GetById", new { SaleId = saleId }, commandType: CommandType.StoredProcedure);
        var sale = await multi.ReadSingleAsync<SaleRow>();
        var customer = await multi.ReadSingleOrDefaultAsync<CustomerRow>();
        var createdByName = await multi.ReadSingleOrDefaultAsync<string>();
        var items = (await multi.ReadAsync<SaleItemWithProductRow>()).ToList();
        var createdPayments = (await multi.ReadAsync<PaymentRow>()).ToList();

        return StatusCode(201, ToDetailJson(sale, customer, createdByName ?? "", items, createdPayments));
    }

    [HttpPost("{id:int}/cancel")]
    [RequirePermission("SALES", "EDIT")]
    public async Task<IActionResult> Cancel(int id, [FromBody] SaleCancelRequest? body)
    {
        if (string.IsNullOrWhiteSpace(body?.Reason)) return BadRequest(new { error = "Cancellation reason is required" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var parameters = new DynamicParameters();
        parameters.Add("SaleId", id);
        parameters.Add("Reason", body.Reason);
        parameters.Add("CreatedById", session.UserId);
        parameters.Add("NotFound", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        parameters.Add("AlreadyCancelled", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        parameters.Add("InvoiceNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);

        await connection.ExecuteAsync("dbo.sp_Sale_Cancel", parameters, commandType: CommandType.StoredProcedure);

        if (parameters.Get<bool>("NotFound")) return NotFound(new { error = "Sale not found" });
        if (parameters.Get<bool>("AlreadyCancelled")) return BadRequest(new { error = "This invoice is already cancelled." });

        var invoiceNumber = parameters.Get<string>("InvoiceNumber");
        await audit.LogAsync(session.UserId, "CANCEL", "SALES", id, invoiceNumber);

        return Ok(new { ok = true });
    }
}
