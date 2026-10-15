-- Day Book: every transaction in the range, oldest first. Document rows (sale, purchase,
-- credit/debit note, estimate/order/challan) carry their value in Total; money rows (payments,
-- expenses, refunds, transfers — from fn_CashBank_Movements) carry MoneyIn / MoneyOut.
-- Result set 2: totals. Cash<->bank transfers are excluded from money in/out (they net to zero).
CREATE OR ALTER PROCEDURE dbo.sp_Report_DayBook
    @From DATETIME2,
    @To DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    WITH DayRows AS (
        SELECT s.InvoiceDate AS TxnDate, 'SALE' AS TxnType, s.Id AS RefId, s.InvoiceNumber AS RefNumber,
               c.Name AS PartyName, CONCAT('Sale invoice', CASE WHEN s.Status = 'CANCELLED' THEN ' (cancelled)' ELSE '' END) AS Description,
               s.GrandTotal AS Total, CAST(0 AS DECIMAL(18,2)) AS MoneyIn, CAST(0 AS DECIMAL(18,2)) AS MoneyOut
        FROM dbo.Sales s LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
        WHERE s.InvoiceDate >= @From AND s.InvoiceDate <= @To

        UNION ALL
        SELECT p.PurchaseDate, 'PURCHASE', p.Id, p.PurchaseNumber, sp.Name,
               CONCAT('Purchase bill', CASE WHEN p.SupplierInvoiceNumber IS NOT NULL THEN CONCAT(' (', p.SupplierInvoiceNumber, ')') ELSE '' END),
               p.GrandTotal, 0, 0
        FROM dbo.Purchases p JOIN dbo.Suppliers sp ON sp.Id = p.SupplierId
        WHERE p.PurchaseDate >= @From AND p.PurchaseDate <= @To

        UNION ALL
        SELECT r.ReturnDate, 'CREDIT_NOTE', r.Id, r.ReturnNumber, c.Name, CONCAT('Sale return: ', r.Reason), r.TotalAmount, 0, 0
        FROM dbo.SaleReturns r LEFT JOIN dbo.Customers c ON c.Id = r.CustomerId
        WHERE r.ReturnDate >= @From AND r.ReturnDate <= @To

        UNION ALL
        SELECT r.ReturnDate, 'DEBIT_NOTE', r.Id, r.ReturnNumber, sp.Name, CONCAT('Purchase return: ', r.Reason), r.TotalAmount, 0, 0
        FROM dbo.PurchaseReturns r LEFT JOIN dbo.Suppliers sp ON sp.Id = r.SupplierId
        WHERE r.ReturnDate >= @From AND r.ReturnDate <= @To

        UNION ALL
        SELECT d.DocDate, d.DocType, d.Id, d.DocNumber, c.Name, CONCAT(LOWER(d.Status), ' ', LOWER(REPLACE(d.DocType, '_', ' '))), d.GrandTotal, 0, 0
        FROM dbo.SalesDocuments d LEFT JOIN dbo.Customers c ON c.Id = d.CustomerId
        WHERE d.DocDate >= @From AND d.DocDate <= @To

        UNION ALL
        SELECT m.TxnDate, m.Source, m.RefId, m.RefNumber, m.PartyName, m.Description,
               CASE WHEN m.Source = 'EXPENSE' THEN m.AmountOut ELSE 0 END, m.AmountIn, m.AmountOut
        FROM dbo.fn_CashBank_Movements() m
        WHERE m.TxnDate >= @From AND m.TxnDate <= @To
    )
    SELECT TxnDate, TxnType, RefId, RefNumber, PartyName, Description, Total, MoneyIn, MoneyOut
    FROM DayRows
    ORDER BY TxnDate, TxnType, RefId;

    SELECT
        COALESCE((SELECT SUM(AmountIn) FROM dbo.fn_CashBank_Movements()
                  WHERE TxnDate >= @From AND TxnDate <= @To AND Source NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')), 0) AS MoneyIn,
        COALESCE((SELECT SUM(AmountOut) FROM dbo.fn_CashBank_Movements()
                  WHERE TxnDate >= @From AND TxnDate <= @To AND Source NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')), 0) AS MoneyOut,
        COALESCE((SELECT SUM(GrandTotal) FROM dbo.Sales WHERE Status = 'CONFIRMED' AND InvoiceDate >= @From AND InvoiceDate <= @To), 0) AS SalesTotal,
        COALESCE((SELECT SUM(GrandTotal) FROM dbo.Purchases WHERE Status = 'CONFIRMED' AND PurchaseDate >= @From AND PurchaseDate <= @To), 0) AS PurchaseTotal,
        COALESCE((SELECT SUM(Amount) FROM dbo.Expenses WHERE Date >= @From AND Date <= @To), 0) AS ExpenseTotal;
END
