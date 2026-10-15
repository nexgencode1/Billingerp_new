namespace BillingErp.Api.Data.Entities;

public class Business
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Logo { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? Gstin { get; set; }
    public string? Pan { get; set; }
    public string? State { get; set; }
    public string? Pincode { get; set; }
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? Ifsc { get; set; }
    public string? UpiId { get; set; }

    public string InvoicePrefix { get; set; } = "INV";
    public string PurchasePrefix { get; set; } = "PUR";
    public string PaymentPrefix { get; set; } = "PAY";
    public string ExpensePrefix { get; set; } = "EXP";
    public string SaleReturnPrefix { get; set; } = "SR";
    public string PurchaseReturnPrefix { get; set; } = "PR";
    public string ProductionPrefix { get; set; } = "PO";
    public string EstimatePrefix { get; set; } = "EST";
    public string SaleOrderPrefix { get; set; } = "SO";
    public string ChallanPrefix { get; set; } = "DC";

    public int SaleCounter { get; set; }
    public int PurchaseCounter { get; set; }
    public int PaymentCounter { get; set; }
    public int ExpenseCounter { get; set; }
    public int SaleReturnCounter { get; set; }
    public int PurchaseReturnCounter { get; set; }
    public int ProductionCounter { get; set; }
    public int EstimateCounter { get; set; }
    public int SaleOrderCounter { get; set; }
    public int ChallanCounter { get; set; }

    public string DateFormat { get; set; } = "dd/MM/yyyy";
    public string Currency { get; set; } = "INR";
    public int DecimalPlaces { get; set; } = 2;

    public bool ShowLogo { get; set; } = true;
    public bool ShowGst { get; set; } = true;
    public bool ShowHsn { get; set; } = true;
    public bool ShowSignature { get; set; } = true;
    public bool ShowTerms { get; set; } = true;
    public string? TermsText { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
