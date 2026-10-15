namespace BillingErp.Api.Dtos;

public record SaleItemInput(int ProductId, string ProductName, decimal Quantity, decimal Rate, decimal? Discount, decimal? GstRate);

public record PaymentInput(string Method, decimal Amount);

public record SaleCreateRequest(DateTime InvoiceDate, int? CustomerId, List<SaleItemInput> Items, List<PaymentInput>? Payments, int? SourceDocumentId = null);

public record SaleCancelRequest(string Reason);

public record SalesDocumentItemInput(int ProductId, string ProductName, decimal Quantity, decimal Rate, decimal? Discount, decimal? GstRate);

public record SalesDocumentCreateRequest(
    string? DocType, DateTime DocDate, DateTime? DueDate, int? CustomerId, string? Notes, List<SalesDocumentItemInput>? Items);
