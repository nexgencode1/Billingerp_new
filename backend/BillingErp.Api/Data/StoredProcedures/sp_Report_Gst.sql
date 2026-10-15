-- Both invoice result sets filtered to CONFIRMED sales only (unlike sp_Report_Sales, which returns
-- unfiltered rows) — matches the original gst report route exactly.
-- Result set 3: rate-wise summary (GST slab → taxable value + tax) from SaleItems, for the chart.
-- Optional filter @CustomerId applies to all result sets; NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Gst
    @From DATETIME2,
    @To DATETIME2,
    @CustomerId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COALESCE(SUM(TaxableAmount), 0) AS TaxableValue,
        COALESCE(SUM(Cgst), 0) AS Cgst,
        COALESCE(SUM(Sgst), 0) AS Sgst,
        COALESCE(SUM(Igst), 0) AS Igst,
        COALESCE(SUM(Cgst + Sgst + Igst), 0) AS TotalGst
    FROM dbo.Sales
    WHERE Status = 'CONFIRMED' AND InvoiceDate >= @From AND InvoiceDate <= @To
      AND (@CustomerId IS NULL OR CustomerId = @CustomerId);

    SELECT
        s.Id, s.InvoiceNumber, s.InvoiceDate, s.CustomerId, c.Name AS CustomerName, c.Gstin AS CustomerGstin,
        s.Subtotal, s.Discount, s.TaxableAmount, s.Cgst, s.Sgst, s.Igst, s.GrandTotal,
        s.PaidAmount, s.DueAmount, s.PaymentStatus, s.PaymentMethod, s.Status, s.CreatedById, s.CreatedAt
    FROM dbo.Sales s
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
      AND (@CustomerId IS NULL OR s.CustomerId = @CustomerId)
    ORDER BY s.InvoiceDate ASC;

    SELECT
        si.GstRate,
        SUM(si.TaxableAmount) AS TaxableValue,
        SUM(si.GstAmount) AS GstAmount
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
      AND (@CustomerId IS NULL OR s.CustomerId = @CustomerId)
    GROUP BY si.GstRate
    ORDER BY si.GstRate ASC;
END
