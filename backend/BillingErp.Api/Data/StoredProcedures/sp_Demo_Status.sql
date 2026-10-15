-- Demo data is identified by its product SKU prefix 'DEMO-' (see Services/DemoDataService.cs).
-- IsLoaded = core history present; HasExtras = demo cash deposits / sales documents present
-- (added in a later version, so an older demo load can be topped up). Plus counts for the UI.
CREATE OR ALTER PROCEDURE dbo.sp_Demo_Status
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Products WHERE Sku LIKE 'DEMO-%') THEN 1 ELSE 0 END AS BIT) AS IsLoaded,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.CashBankTransactions WHERE Note LIKE 'Demo:%')
                    OR EXISTS (SELECT 1 FROM dbo.SalesDocuments WHERE Notes LIKE 'Demo%') THEN 1 ELSE 0 END AS BIT) AS HasExtras,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.CustomerPortalAccounts a JOIN dbo.Customers c ON c.Id = a.CustomerId WHERE c.Notes = 'Demo customer')
                  THEN 1 ELSE 0 END AS BIT) AS HasExtras2,
        (SELECT COUNT(*) FROM dbo.Products) AS Products,
        (SELECT COUNT(*) FROM dbo.Customers) AS Customers,
        (SELECT COUNT(*) FROM dbo.Suppliers) AS Suppliers,
        (SELECT COUNT(*) FROM dbo.Sales) AS Sales,
        (SELECT COUNT(*) FROM dbo.Purchases) AS Purchases,
        (SELECT COUNT(*) FROM dbo.Payments) AS Payments,
        (SELECT COUNT(*) FROM dbo.Expenses) AS Expenses;
END
