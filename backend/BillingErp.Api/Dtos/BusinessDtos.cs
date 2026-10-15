namespace BillingErp.Api.Dtos;

public record BusinessUpdateRequest(
    string? Name, string? Logo, string? Address, string? Phone, string? Email, string? Website,
    string? Gstin, string? Pan, string? State, string? Pincode, string? BankName, string? AccountNumber,
    string? Ifsc, string? UpiId, string? InvoicePrefix, string? PurchasePrefix, string? PaymentPrefix,
    string? ExpensePrefix, string? SaleReturnPrefix, string? PurchaseReturnPrefix, string? DateFormat,
    string? Currency, int? DecimalPlaces, bool? ShowLogo, bool? ShowGst, bool? ShowHsn, bool? ShowSignature,
    bool? ShowTerms, string? TermsText, string? EstimatePrefix = null, string? SaleOrderPrefix = null, string? ChallanPrefix = null);
