-- Header bell alerts. 3 result sets:
-- 1) active products at/below their minimum stock (balance from the stock ledger),
-- 2) confirmed sales with a balance due older than @OverdueDays,
-- 3) OPEN estimates / sale orders / challans whose valid-until / delivery date has passed.
CREATE OR ALTER PROCEDURE dbo.sp_Alerts_Summary
    @OverdueDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today DATE = CAST(SYSDATETIME() AS DATE);
    DECLARE @OverdueBefore DATETIME2 = DATEADD(DAY, -@OverdueDays, @Today);

    SELECT p.Id, p.Name, p.Sku, p.MinimumStock, COALESCE(st.Balance, 0) AS Balance,
           COALESCE(u.ShortName, u.Name) AS UnitLabel
    FROM dbo.Products p
    JOIN dbo.Units u ON u.Id = p.UnitId
    OUTER APPLY (
        SELECT SUM(t.QuantityIn) - SUM(t.QuantityOut) AS Balance
        FROM dbo.StockTransactions t WHERE t.ProductId = p.Id
    ) st
    WHERE p.Status = 1 AND COALESCE(st.Balance, 0) <= p.MinimumStock
    ORDER BY COALESCE(st.Balance, 0) ASC, p.Name ASC;

    SELECT s.Id, s.InvoiceNumber, s.InvoiceDate, s.DueAmount, c.Name AS CustomerName,
           DATEDIFF(DAY, s.InvoiceDate, @Today) AS DaysOld
    FROM dbo.Sales s
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.DueAmount > 0 AND s.InvoiceDate < @OverdueBefore
    ORDER BY s.DueAmount DESC;

    SELECT d.Id, d.DocType, d.DocNumber, d.DueDate, d.GrandTotal, c.Name AS CustomerName
    FROM dbo.SalesDocuments d
    LEFT JOIN dbo.Customers c ON c.Id = d.CustomerId
    WHERE d.Status = 'OPEN' AND d.DueDate IS NOT NULL AND d.DueDate < @Today
    ORDER BY d.DueDate ASC;
END
