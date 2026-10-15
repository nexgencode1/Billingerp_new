-- Period-bucketed totals for report/dashboard charts. @GroupBy = 'DAY' | 'MONTH' (anything else
-- is treated as MONTH). One row per period that has any activity; Period is the bucket's first day.
-- Sales/Purchases = CONFIRMED GrandTotal; Cogs uses the same current-PurchasePrice basis as
-- sp_Report_Profit; NetProfit = taxable sales − COGS − expenses (same formula as sp_Report_Profit).
CREATE OR ALTER PROCEDURE dbo.sp_Report_Trend
    @From DATETIME2,
    @To DATETIME2,
    @GroupBy NVARCHAR(10) = 'MONTH'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ByDay BIT = CASE WHEN @GroupBy = 'DAY' THEN 1 ELSE 0 END;

    WITH Movements AS (
        SELECT CAST(s.InvoiceDate AS DATE) AS D, s.GrandTotal AS Sales, s.TaxableAmount AS TaxableSales,
               CAST(0 AS DECIMAL(18,2)) AS Purchases, CAST(0 AS DECIMAL(18,2)) AS Expenses,
               CAST(0 AS DECIMAL(18,2)) AS Received, CAST(0 AS DECIMAL(18,2)) AS Paid,
               CAST(0 AS DECIMAL(18,2)) AS Cogs
        FROM dbo.Sales s
        WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To

        UNION ALL
        SELECT CAST(s.InvoiceDate AS DATE), 0, 0, 0, 0, 0, 0, si.Quantity * p.PurchasePrice
        FROM dbo.Sales s
        JOIN dbo.SaleItems si ON si.SaleId = s.Id
        JOIN dbo.Products p ON p.Id = si.ProductId
        WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To

        UNION ALL
        SELECT CAST(PurchaseDate AS DATE), 0, 0, GrandTotal, 0, 0, 0, 0
        FROM dbo.Purchases
        WHERE Status = 'CONFIRMED' AND PurchaseDate >= @From AND PurchaseDate <= @To

        UNION ALL
        SELECT CAST(Date AS DATE), 0, 0, 0, Amount, 0, 0, 0
        FROM dbo.Expenses
        WHERE Date >= @From AND Date <= @To

        UNION ALL
        SELECT CAST(Date AS DATE), 0, 0, 0, 0,
               CASE WHEN Direction = 'RECEIVE' THEN Amount ELSE 0 END,
               CASE WHEN Direction = 'PAY' THEN Amount ELSE 0 END, 0
        FROM dbo.Payments
        WHERE Date >= @From AND Date <= @To
    ),
    Bucketed AS (
        SELECT
            CASE WHEN @ByDay = 1 THEN D ELSE DATEFROMPARTS(YEAR(D), MONTH(D), 1) END AS Period,
            Sales, TaxableSales, Purchases, Expenses, Received, Paid, Cogs
        FROM Movements
    )
    SELECT
        Period,
        SUM(Sales) AS Sales,
        SUM(Purchases) AS Purchases,
        SUM(Expenses) AS Expenses,
        SUM(Received) AS Received,
        SUM(Paid) AS Paid,
        SUM(Cogs) AS Cogs,
        SUM(TaxableSales) - SUM(Cogs) - SUM(Expenses) AS NetProfit
    FROM Bucketed
    GROUP BY Period
    ORDER BY Period ASC;
END
