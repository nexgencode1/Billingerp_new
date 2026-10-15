-- Dashboard insights for [@From, @To] compared with the same-length period before it.
-- 1) period KPIs (current) 2) period KPIs (previous) — same columns
-- 3) top 5 products  4) top 5 customers  5) receivable aging buckets (all open dues, by invoice age)
-- 6) sales by product category  7) sales by weekday (1 = Sunday … 7 = Saturday, DATEFIRST-independent)
-- Profit uses the same basis as sp_Report_Profit (taxable sales − COGS at current purchase price − expenses).
CREATE OR ALTER PROCEDURE dbo.sp_Dashboard_Analytics
    @From DATETIME2,
    @To DATETIME2,
    @PrevFrom DATETIME2,
    @PrevTo DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Periods TABLE (Slot INT, F DATETIME2, T DATETIME2);
    INSERT INTO @Periods VALUES (1, @From, @To), (2, @PrevFrom, @PrevTo);

    -- 1) + 2)
    SELECT
        pr.Slot,
        COALESCE(s.Sales, 0) AS Sales,
        COALESCE(s.Taxable, 0) AS TaxableSales,
        COALESCE(s.Invoices, 0) AS Invoices,
        COALESCE(c.Cogs, 0) AS Cogs,
        COALESCE(e.Expenses, 0) AS Expenses,
        COALESCE(pay.Received, 0) AS Received,
        COALESCE(pu.Purchases, 0) AS Purchases,
        COALESCE(nc.NewCustomers, 0) AS NewCustomers
    FROM @Periods pr
    OUTER APPLY (SELECT SUM(GrandTotal) AS Sales, SUM(TaxableAmount) AS Taxable, COUNT(*) AS Invoices
                 FROM dbo.Sales WHERE Status = 'CONFIRMED' AND InvoiceDate >= pr.F AND InvoiceDate <= pr.T) s
    OUTER APPLY (SELECT SUM(si.Quantity * p.PurchasePrice) AS Cogs
                 FROM dbo.Sales sa JOIN dbo.SaleItems si ON si.SaleId = sa.Id JOIN dbo.Products p ON p.Id = si.ProductId
                 WHERE sa.Status = 'CONFIRMED' AND sa.InvoiceDate >= pr.F AND sa.InvoiceDate <= pr.T) c
    OUTER APPLY (SELECT SUM(Amount) AS Expenses FROM dbo.Expenses WHERE Date >= pr.F AND Date <= pr.T) e
    OUTER APPLY (SELECT SUM(Amount) AS Received FROM dbo.Payments WHERE Direction = 'RECEIVE' AND Date >= pr.F AND Date <= pr.T) pay
    OUTER APPLY (SELECT SUM(GrandTotal) AS Purchases FROM dbo.Purchases WHERE Status = 'CONFIRMED' AND PurchaseDate >= pr.F AND PurchaseDate <= pr.T) pu
    OUTER APPLY (SELECT COUNT(*) AS NewCustomers FROM dbo.Customers WHERE CreatedAt >= pr.F AND CreatedAt <= pr.T) nc
    ORDER BY pr.Slot;

    -- 3) top products
    SELECT TOP 5 si.ProductId, MIN(si.ProductName) AS Name, SUM(si.Quantity) AS Quantity, SUM(si.Total) AS Amount,
           SUM(si.TaxableAmount) - SUM(si.Quantity * p.PurchasePrice) AS Profit
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    JOIN dbo.Products p ON p.Id = si.ProductId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY si.ProductId
    ORDER BY SUM(si.Total) DESC;

    -- 4) top customers
    SELECT TOP 5 c.Id AS CustomerId, c.Name, COUNT(*) AS Invoices, SUM(s.GrandTotal) AS Amount, SUM(s.DueAmount) AS Due
    FROM dbo.Sales s
    JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY c.Id, c.Name
    ORDER BY SUM(s.GrandTotal) DESC;

    -- 5) receivable aging (open dues as of now)
    SELECT b.Bucket, b.SortOrder, COALESCE(SUM(x.DueAmount), 0) AS Amount, COUNT(x.Id) AS Invoices
    FROM (VALUES ('0-30 days', 1), ('31-60 days', 2), ('61-90 days', 3), ('90+ days', 4)) b(Bucket, SortOrder)
    LEFT JOIN (
        SELECT Id, DueAmount,
               CASE WHEN DATEDIFF(DAY, InvoiceDate, SYSDATETIME()) <= 30 THEN '0-30 days'
                    WHEN DATEDIFF(DAY, InvoiceDate, SYSDATETIME()) <= 60 THEN '31-60 days'
                    WHEN DATEDIFF(DAY, InvoiceDate, SYSDATETIME()) <= 90 THEN '61-90 days'
                    ELSE '90+ days' END AS Bucket
        FROM dbo.Sales WHERE Status = 'CONFIRMED' AND DueAmount > 0
    ) x ON x.Bucket = b.Bucket
    GROUP BY b.Bucket, b.SortOrder
    ORDER BY b.SortOrder;

    -- 6) sales by category
    SELECT COALESCE(cat.Name, 'Uncategorized') AS Category, SUM(si.Total) AS Amount
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    JOIN dbo.Products p ON p.Id = si.ProductId
    LEFT JOIN dbo.Categories cat ON cat.Id = p.CategoryId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY COALESCE(cat.Name, 'Uncategorized')
    ORDER BY SUM(si.Total) DESC;

    -- 7) sales by weekday ((DATEDIFF from a known Sunday) mod 7 avoids depending on SET DATEFIRST)
    SELECT (DATEDIFF(DAY, '19000107', CAST(InvoiceDate AS DATE)) % 7) + 1 AS Weekday,
           SUM(GrandTotal) AS Amount, COUNT(*) AS Invoices
    FROM dbo.Sales
    WHERE Status = 'CONFIRMED' AND InvoiceDate >= @From AND InvoiceDate <= @To
    GROUP BY (DATEDIFF(DAY, '19000107', CAST(InvoiceDate AS DATE)) % 7) + 1
    ORDER BY Weekday;
END
