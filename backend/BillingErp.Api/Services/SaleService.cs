using System.Data;
using System.Text.Json;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using Dapper;

namespace BillingErp.Api.Services;

public record SaleCreateOutcome(int? SaleId, string? InvoiceNumber, int ErrorStatus, string? Error)
{
    public bool Ok => SaleId is not null;
    public static SaleCreateOutcome Fail(int status, string error) => new(null, null, status, error);
}

// The single path that creates a sale invoice — used by POST /api/sales and by the recurring
// invoice worker, so both get the same validation, stock check, GST split and numbering.
// (Moved out of SalesController.Create unchanged, plus a negative-payment guard.)
public class SaleService(SqlConnectionFactory connectionFactory, PlanAccessService planAccess)
{
    public async Task<SaleCreateOutcome> CreateAsync(SaleCreateRequest? body, int userId)
    {
        if (body is null || body.Items is null || body.Items.Count == 0)
            return SaleCreateOutcome.Fail(400, "Add at least one product");
        foreach (var item in body.Items)
        {
            if (item.Quantity <= 0) return SaleCreateOutcome.Fail(400, "Quantity must be greater than 0");
            if (item.Rate < 0) return SaleCreateOutcome.Fail(400, "Invalid input");
        }
        if (body.Payments?.Any(p => p.Amount < 0) == true)
            return SaleCreateOutcome.Fail(400, "Payment amount can't be negative");

        // Subscription bill allowance (free trial / Basic monthly limit / no plan).
        var planError = await planAccess.CheckNewInvoiceAsync();
        if (planError is not null) return SaleCreateOutcome.Fail(402, planError);

        using var connection = connectionFactory.Create();

        var ctxParams = new DynamicParameters();
        ctxParams.Add("CustomerId", body.CustomerId);
        ctxParams.Add("BusinessState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctxParams.Add("CustomerState", dbType: DbType.String, direction: ParameterDirection.Output, size: 100);
        ctxParams.Add("CustomerExists", dbType: DbType.Boolean, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Sale_PrepareContext", ctxParams, commandType: CommandType.StoredProcedure);

        if (body.CustomerId is not null && !ctxParams.Get<bool>("CustomerExists"))
            return SaleCreateOutcome.Fail(404, "Customer not found");

        var businessState = ctxParams.Get<string?>("BusinessState");
        var customerState = ctxParams.Get<string?>("CustomerState");
        var isInterstate = !string.IsNullOrEmpty(businessState) && !string.IsNullOrEmpty(customerState)
            && !string.Equals(businessState, customerState, StringComparison.OrdinalIgnoreCase);

        // Stock availability check (mirrors the original's pre-transaction loop)
        foreach (var item in body.Items)
        {
            var balance = await connection.ExecuteScalarAsync<decimal>(
                "dbo.sp_Stock_GetBalance", new { ProductId = item.ProductId }, commandType: CommandType.StoredProcedure);
            if (balance < item.Quantity)
            {
                var product = await connection.QuerySingleOrDefaultAsync<dynamic>(
                    "dbo.sp_Product_GetById", new { ProductId = item.ProductId }, commandType: CommandType.StoredProcedure);
                string name = product is not null ? (string)product.Name : item.ProductName;
                return SaleCreateOutcome.Fail(400, $"Insufficient stock for \"{name}\". Available: {balance}");
            }
        }

        var lineItems = body.Items.Select(i => new LineItemInput(i.Quantity, i.Rate, i.Discount ?? 0, i.GstRate ?? 0)).ToList();
        var totals = GstService.ComputeInvoiceTotals(lineItems, isInterstate);

        var payments = body.Payments ?? new List<PaymentInput>();
        var paidAmount = payments.Sum(p => p.Amount);
        var dueAmount = Math.Max(0, totals.GrandTotal - paidAmount);
        var paymentStatus = paidAmount <= 0 ? "DUE" : dueAmount <= 0 ? "PAID" : "PARTIAL";
        var paymentMethod = payments.Count == 0 ? "CREDIT" : payments.Count == 1 ? payments[0].Method : "SPLIT";

        var itemsJson = JsonSerializer.Serialize(body.Items.Select((i, idx) => new
        {
            productId = i.ProductId,
            productName = i.ProductName,
            quantity = totals.Items[idx].Quantity,
            rate = totals.Items[idx].Rate,
            discount = totals.Items[idx].Discount,
            gstRate = totals.Items[idx].GstRate,
            taxableAmount = totals.Items[idx].TaxableAmount,
            gstAmount = totals.Items[idx].GstAmount,
            total = totals.Items[idx].Total,
        }));
        var paymentsJson = JsonSerializer.Serialize(payments.Select(p => new { method = p.Method, amount = p.Amount }));

        var parameters = new DynamicParameters();
        parameters.Add("InvoiceDate", body.InvoiceDate);
        parameters.Add("CustomerId", body.CustomerId);
        parameters.Add("Subtotal", totals.Subtotal);
        parameters.Add("Discount", totals.Discount);
        parameters.Add("TaxableAmount", totals.TaxableAmount);
        parameters.Add("Cgst", totals.Cgst);
        parameters.Add("Sgst", totals.Sgst);
        parameters.Add("Igst", totals.Igst);
        parameters.Add("GrandTotal", totals.GrandTotal);
        parameters.Add("PaidAmount", paidAmount);
        parameters.Add("DueAmount", dueAmount);
        parameters.Add("PaymentStatus", paymentStatus);
        parameters.Add("PaymentMethod", paymentMethod);
        parameters.Add("ItemsJson", itemsJson);
        parameters.Add("PaymentsJson", paymentsJson);
        parameters.Add("CreatedById", userId);
        parameters.Add("SourceDocumentId", body.SourceDocumentId);
        parameters.Add("SaleId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("InvoiceNumber", dbType: DbType.String, direction: ParameterDirection.Output, size: 50);

        try
        {
            await connection.ExecuteAsync("dbo.sp_Sale_Create", parameters, commandType: CommandType.StoredProcedure);
        }
        catch (Microsoft.Data.SqlClient.SqlException ex) when (ex.Number == 51003)
        {
            return SaleCreateOutcome.Fail(400, ex.Message);
        }

        return new SaleCreateOutcome(parameters.Get<int>("SaleId"), parameters.Get<string>("InvoiceNumber"), 0, null);
    }
}
