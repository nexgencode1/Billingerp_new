namespace BillingErp.Api.Data.Entities;

// Local HSN / SAC lookup used to suggest a code + GST rate on the product form. Loaded by an admin
// from the government's public list via Excel import — the app ships no codes or rates of its own.
// VERIFY: official rule (rates change; a human must confirm).
public class HsnCode
{
    public string Code { get; set; } = string.Empty; // primary key
    public string Description { get; set; } = string.Empty;
    public decimal? GstRate { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// A sale that repeats on a schedule (rent, AMC, monthly supply...). RecurringInvoiceWorker creates
// the actual invoice through SaleService on/after NextRunDate, then advances NextRunDate.
public class RecurringInvoice
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public string Frequency { get; set; } = "MONTHLY"; // WEEKLY | MONTHLY | QUARTERLY | YEARLY
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime NextRunDate { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastRunAt { get; set; }
    public int? LastSaleId { get; set; }
    public Sale? LastSale { get; set; }
    public string? LastError { get; set; }
    public int RunCount { get; set; }
    public string? Notes { get; set; }
    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<RecurringInvoiceItem> Items { get; set; } = new();
}

public class RecurringInvoiceItem
{
    public int Id { get; set; }
    public int RecurringInvoiceId { get; set; }
    public RecurringInvoice RecurringInvoice { get; set; } = null!;
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public string ProductName { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal Rate { get; set; }
    public decimal Discount { get; set; }
    public decimal GstRate { get; set; }
}

// One row per reminder sent (or attempted) for an unpaid invoice — used to avoid re-sending too
// often and to show "last reminded" on the Reminders screen.
public class PaymentReminder
{
    public int Id { get; set; }
    public int SaleId { get; set; }
    public Sale Sale { get; set; } = null!;
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Channel { get; set; } = "EMAIL"; // EMAIL | WHATSAPP
    public string Status { get; set; } = "SENT"; // SENT | FAILED
    public string? Error { get; set; }
    public bool IsAutomatic { get; set; }
    public int? CreatedById { get; set; }
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
