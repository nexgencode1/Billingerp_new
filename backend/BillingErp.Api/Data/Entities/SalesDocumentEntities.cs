namespace BillingErp.Api.Data.Entities;

// Pre-invoice sales documents: Estimate/Quotation, Sale Order, Delivery Challan — one table,
// distinguished by DocType. None of these move stock, touch dues or create payments; they only
// become a real Sale when converted (sp_Sale_Create marks the source document CONVERTED inside
// the same transaction that saves the invoice).
public class SalesDocument
{
    public int Id { get; set; }
    public string DocType { get; set; } = "ESTIMATE"; // ESTIMATE | SALE_ORDER | DELIVERY_CHALLAN
    public string DocNumber { get; set; } = string.Empty;
    public DateTime DocDate { get; set; }
    public DateTime? DueDate { get; set; } // estimate "valid until" / order "delivery by"
    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal Cgst { get; set; }
    public decimal Sgst { get; set; }
    public decimal Igst { get; set; }
    public decimal GrandTotal { get; set; }
    public string Status { get; set; } = "OPEN"; // OPEN | CONVERTED | CANCELLED
    public int? ConvertedSaleId { get; set; }
    public Sale? ConvertedSale { get; set; }
    public string? Notes { get; set; }
    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<SalesDocumentItem> Items { get; set; } = new();
}

public class SalesDocumentItem
{
    public int Id { get; set; }
    public int SalesDocumentId { get; set; }
    public SalesDocument SalesDocument { get; set; } = null!;
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public string ProductName { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal Rate { get; set; }
    public decimal Discount { get; set; }
    public decimal GstRate { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal GstAmount { get; set; }
    public decimal Total { get; set; }
}
