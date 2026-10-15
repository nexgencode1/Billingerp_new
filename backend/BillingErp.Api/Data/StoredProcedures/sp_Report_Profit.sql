-- Result set 1: single summary row. Result set 2: item-wise profit (CONFIRMED sales in range).
-- COGS joins against Product.PurchasePrice's CURRENT value (no historical cost snapshot on
-- SaleItem) — same live-price caveat the original has; preserved as-is.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Profit
    @From DATETIME2,
    @To DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @GrossSales DECIMAL(18,2), @Cost DECIMAL(18,2), @Expenses DECIMAL(18,2);

    SELECT @GrossSales = COALESCE(SUM(TaxableAmount), 0)
    FROM dbo.Sales
    WHERE Status = 'CONFIRMED' AND InvoiceDate >= @From AND InvoiceDate <= @To;

    SELECT @Cost = COALESCE(SUM(si.Quantity * p.PurchasePrice), 0)
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    JOIN dbo.Products p ON p.Id = si.ProductId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To;

    SELECT @Expenses = COALESCE(SUM(Amount), 0)
    FROM dbo.Expenses
    WHERE Date >= @From AND Date <= @To;

    DECLARE @GrossProfit DECIMAL(18,2) = @GrossSales - @Cost;
    DECLARE @NetProfit DECIMAL(18,2) = @GrossProfit - @Expenses;
    DECLARE @ProfitPercent DECIMAL(18,4) = CASE WHEN @GrossSales > 0 THEN (@NetProfit / @GrossSales) * 100 ELSE 0 END;

    SELECT @GrossSales AS GrossSales, @Cost AS Cost, @GrossProfit AS GrossProfit,
           @Expenses AS Expenses, @NetProfit AS NetProfit, @ProfitPercent AS ProfitPercent;

    SELECT
        p.Id AS ProductId,
        p.Name,
        SUM(si.Quantity) AS Quantity,
        SUM(si.TaxableAmount) AS SalesAmount,
        SUM(si.Quantity * p.PurchasePrice) AS CostAmount,
        SUM(si.TaxableAmount) - SUM(si.Quantity * p.PurchasePrice) AS Profit
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    JOIN dbo.Products p ON p.Id = si.ProductId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY p.Id, p.Name
    ORDER BY Profit DESC;
END
