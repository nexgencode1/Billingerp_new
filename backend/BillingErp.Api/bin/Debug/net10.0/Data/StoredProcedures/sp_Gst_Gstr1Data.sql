-- Raw data for GSTR-1 (outward supplies) for CONFIRMED sales in [@From, @To]. The C# side
-- (GstReturnsController) classifies into B2B / B2CL / B2CS using Config/gst.json.
-- 1) business GSTIN + state
-- 2) one row per invoice x GST rate (tax split CGST/SGST vs IGST follows how the invoice was taxed)
-- 3) HSN summary — HSN/unit come from the product's CURRENT master data (SaleItems has no HSN
--    snapshot; same live-data caveat as the profit report)
-- 4) document summary (invoice no. range, total, cancelled)
-- 5) credit notes (sale returns) in the period — listed for manual review; they carry no tax split
CREATE OR ALTER PROCEDURE dbo.sp_Gst_Gstr1Data
    @From DATETIME2,
    @To DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1 Gstin, State, Name FROM dbo.Businesses;

    SELECT
        s.Id AS SaleId, s.InvoiceNumber, s.InvoiceDate, s.GrandTotal AS InvoiceValue,
        c.Name AS CustomerName, NULLIF(LTRIM(RTRIM(c.Gstin)), '') AS CustomerGstin, c.State AS CustomerState,
        CAST(CASE WHEN s.Igst > 0 THEN 1 ELSE 0 END AS BIT) AS IsInterstate,
        si.GstRate AS Rate,
        SUM(si.TaxableAmount) AS TaxableValue,
        SUM(CASE WHEN s.Igst > 0 THEN si.GstAmount ELSE 0 END) AS Igst,
        SUM(CASE WHEN s.Igst > 0 THEN 0 ELSE si.GstAmount / 2 END) AS Cgst,
        SUM(CASE WHEN s.Igst > 0 THEN 0 ELSE si.GstAmount / 2 END) AS Sgst
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY s.Id, s.InvoiceNumber, s.InvoiceDate, s.GrandTotal, c.Name, c.Gstin, c.State, s.Igst, si.GstRate
    ORDER BY s.InvoiceDate, s.Id, si.GstRate;

    SELECT
        COALESCE(NULLIF(LTRIM(RTRIM(p.HsnCode)), ''), 'NA') AS HsnCode,
        MIN(p.Name) AS Description,
        u.Name AS UnitName, u.ShortName AS UnitShortName,
        si.GstRate AS Rate,
        SUM(si.Quantity) AS Quantity,
        SUM(si.Total) AS TotalValue,
        SUM(si.TaxableAmount) AS TaxableValue,
        SUM(CASE WHEN s.Igst > 0 THEN si.GstAmount ELSE 0 END) AS Igst,
        SUM(CASE WHEN s.Igst > 0 THEN 0 ELSE si.GstAmount / 2 END) AS Cgst,
        SUM(CASE WHEN s.Igst > 0 THEN 0 ELSE si.GstAmount / 2 END) AS Sgst,
        CAST(MAX(CASE WHEN NULLIF(LTRIM(RTRIM(c.Gstin)), '') IS NOT NULL THEN 1 ELSE 0 END) AS BIT) AS HasB2b
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    JOIN dbo.Products p ON p.Id = si.ProductId
    JOIN dbo.Units u ON u.Id = p.UnitId
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(p.HsnCode)), ''), 'NA'), u.Name, u.ShortName, si.GstRate
    ORDER BY HsnCode, si.GstRate;

    SELECT
        MIN(InvoiceNumber) AS FromNumber, MAX(InvoiceNumber) AS ToNumber,
        COUNT(*) AS TotalCount,
        SUM(CASE WHEN Status = 'CANCELLED' THEN 1 ELSE 0 END) AS CancelledCount
    FROM dbo.Sales
    WHERE InvoiceDate >= @From AND InvoiceDate <= @To;

    SELECT r.ReturnNumber, r.ReturnDate, r.TotalAmount, s.InvoiceNumber, c.Name AS CustomerName,
           NULLIF(LTRIM(RTRIM(c.Gstin)), '') AS CustomerGstin
    FROM dbo.SaleReturns r
    JOIN dbo.Sales s ON s.Id = r.SaleId
    LEFT JOIN dbo.Customers c ON c.Id = r.CustomerId
    WHERE r.ReturnDate >= @From AND r.ReturnDate <= @To
    ORDER BY r.ReturnDate;
END
