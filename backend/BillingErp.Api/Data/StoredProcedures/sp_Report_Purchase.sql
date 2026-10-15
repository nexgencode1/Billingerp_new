-- Result set 1: summary (CONFIRMED only). Result set 2: all purchases in range.
-- Result set 3: top 10 suppliers by purchase amount (CONFIRMED only) — feeds the report's chart.
-- Optional filters (@SupplierId, @PaymentStatus) apply to all three result sets; NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Purchase
    @From DATETIME2,
    @To DATETIME2,
    @SupplierId INT = NULL,
    @PaymentStatus NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COUNT(*) AS TotalPurchases,
        COALESCE(SUM(GrandTotal), 0) AS TotalAmount,
        COALESCE(SUM(TaxableAmount), 0) AS TaxableAmount,
        COALESCE(SUM(Cgst + Sgst + Igst), 0) AS TotalGst,
        COALESCE(SUM(Discount), 0) AS TotalDiscount,
        COALESCE(SUM(PaidAmount), 0) AS TotalPaid,
        COALESCE(SUM(DueAmount), 0) AS TotalDue
    FROM dbo.Purchases
    WHERE PurchaseDate >= @From AND PurchaseDate <= @To AND Status = 'CONFIRMED'
      AND (@SupplierId IS NULL OR SupplierId = @SupplierId)
      AND (@PaymentStatus IS NULL OR PaymentStatus = @PaymentStatus);

    SELECT
        p.Id, p.PurchaseNumber, p.SupplierInvoiceNumber, p.PurchaseDate, p.SupplierId, s.Name AS SupplierName,
        p.Subtotal, p.Discount, p.TaxableAmount, p.Cgst, p.Sgst, p.Igst, p.GrandTotal,
        p.PaidAmount, p.DueAmount, p.PaymentStatus, p.PaymentMethod, p.Status, p.CreatedById, p.CreatedAt
    FROM dbo.Purchases p
    JOIN dbo.Suppliers s ON s.Id = p.SupplierId
    WHERE p.PurchaseDate >= @From AND p.PurchaseDate <= @To
      AND (@SupplierId IS NULL OR p.SupplierId = @SupplierId)
      AND (@PaymentStatus IS NULL OR p.PaymentStatus = @PaymentStatus)
    ORDER BY p.PurchaseDate ASC;

    SELECT TOP 10
        s.Name,
        COUNT(*) AS Quantity,
        SUM(p.GrandTotal) AS Amount
    FROM dbo.Purchases p
    JOIN dbo.Suppliers s ON s.Id = p.SupplierId
    WHERE p.PurchaseDate >= @From AND p.PurchaseDate <= @To AND p.Status = 'CONFIRMED'
      AND (@SupplierId IS NULL OR p.SupplierId = @SupplierId)
      AND (@PaymentStatus IS NULL OR p.PaymentStatus = @PaymentStatus)
    GROUP BY s.Name
    ORDER BY SUM(p.GrandTotal) DESC;
END
