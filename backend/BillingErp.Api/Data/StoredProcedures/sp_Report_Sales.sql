-- Result set 1: summary aggregated over CONFIRMED sales only.
-- Result set 2: ALL sales in range (any status) with customer name — matches the original, which
-- returns the unfiltered row list even though the summary only counts CONFIRMED ones.
-- Result set 3: top 10 products by sales amount (CONFIRMED only) — feeds the report's chart.
-- Optional filters (@CustomerId, @PaymentStatus) apply to all three result sets; NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Sales
    @From DATETIME2,
    @To DATETIME2,
    @CustomerId INT = NULL,
    @PaymentStatus NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COUNT(*) AS TotalInvoices,
        COALESCE(SUM(GrandTotal), 0) AS TotalSales,
        COALESCE(SUM(Discount), 0) AS TotalDiscount,
        COALESCE(SUM(TaxableAmount), 0) AS TaxableAmount,
        COALESCE(SUM(Cgst + Sgst + Igst), 0) AS TotalGst,
        COALESCE(SUM(PaidAmount), 0) AS TotalPaid,
        COALESCE(SUM(DueAmount), 0) AS TotalDue
    FROM dbo.Sales
    WHERE InvoiceDate >= @From AND InvoiceDate <= @To AND Status = 'CONFIRMED'
      AND (@CustomerId IS NULL OR CustomerId = @CustomerId)
      AND (@PaymentStatus IS NULL OR PaymentStatus = @PaymentStatus);

    SELECT
        s.Id, s.InvoiceNumber, s.InvoiceDate, s.CustomerId, c.Name AS CustomerName,
        s.Subtotal, s.Discount, s.TaxableAmount, s.Cgst, s.Sgst, s.Igst, s.GrandTotal,
        s.PaidAmount, s.DueAmount, s.PaymentStatus, s.PaymentMethod, s.Status, s.CancelReason,
        s.CreatedById, s.CreatedAt
    FROM dbo.Sales s
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.InvoiceDate >= @From AND s.InvoiceDate <= @To
      AND (@CustomerId IS NULL OR s.CustomerId = @CustomerId)
      AND (@PaymentStatus IS NULL OR s.PaymentStatus = @PaymentStatus)
    ORDER BY s.InvoiceDate ASC;

    SELECT TOP 10
        si.ProductName AS Name,
        SUM(si.Quantity) AS Quantity,
        SUM(si.Total) AS Amount
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    WHERE s.InvoiceDate >= @From AND s.InvoiceDate <= @To AND s.Status = 'CONFIRMED'
      AND (@CustomerId IS NULL OR s.CustomerId = @CustomerId)
      AND (@PaymentStatus IS NULL OR s.PaymentStatus = @PaymentStatus)
    GROUP BY si.ProductName
    ORDER BY SUM(si.Total) DESC;
END
