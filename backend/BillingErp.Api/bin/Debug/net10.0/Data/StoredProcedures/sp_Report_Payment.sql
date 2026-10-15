-- 3 result sets: 1) totals (totalReceived/totalPaid), 2) byMethod (method,amount) across all
-- directions combined (matches original: byMethod sums every payment regardless of direction),
-- 3) full payment rows with related names.
-- Optional filters (@Direction = RECEIVE|PAY, @Method) apply to all result sets; NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Payment
    @From DATETIME2,
    @To DATETIME2,
    @Direction NVARCHAR(20) = NULL,
    @Method NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COALESCE(SUM(CASE WHEN Direction = 'RECEIVE' THEN Amount ELSE 0 END), 0) AS TotalReceived,
        COALESCE(SUM(CASE WHEN Direction = 'PAY' THEN Amount ELSE 0 END), 0) AS TotalPaid
    FROM dbo.Payments
    WHERE Date >= @From AND Date <= @To
      AND (@Direction IS NULL OR Direction = @Direction)
      AND (@Method IS NULL OR Method = @Method);

    SELECT Method, SUM(Amount) AS Amount
    FROM dbo.Payments
    WHERE Date >= @From AND Date <= @To
      AND (@Direction IS NULL OR Direction = @Direction)
      AND (@Method IS NULL OR Method = @Method)
    GROUP BY Method;

    SELECT
        p.Id, p.PaymentNumber, p.Direction, p.Date, p.Amount, p.Method, p.ReferenceNo, p.Notes,
        p.CustomerId, c.Name AS CustomerName, p.SupplierId, sup.Name AS SupplierName,
        p.SaleId, sa.InvoiceNumber AS SaleInvoiceNumber, p.PurchaseId, pu.PurchaseNumber,
        p.CreatedById, p.CreatedAt
    FROM dbo.Payments p
    LEFT JOIN dbo.Customers c ON c.Id = p.CustomerId
    LEFT JOIN dbo.Suppliers sup ON sup.Id = p.SupplierId
    LEFT JOIN dbo.Sales sa ON sa.Id = p.SaleId
    LEFT JOIN dbo.Purchases pu ON pu.Id = p.PurchaseId
    WHERE p.Date >= @From AND p.Date <= @To
      AND (@Direction IS NULL OR p.Direction = @Direction)
      AND (@Method IS NULL OR p.Method = @Method)
    ORDER BY p.Date ASC;
END
