-- Figures for a GSTR-3B style summary for [@From, @To] (CONFIRMED documents only).
-- 1) outward taxable supplies (table 3.1(a)): taxable value + IGST/CGST/SGST
-- 2) inter-state supplies to unregistered persons by customer state (table 3.2)
-- 3) eligible ITC from purchases (table 4, "all other ITC"): IGST/CGST/SGST
-- 4) zero-rated / nil-rated outward value (items at 0% GST)
CREATE OR ALTER PROCEDURE dbo.sp_Gst_Gstr3bData
    @From DATETIME2,
    @To DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        COALESCE(SUM(TaxableAmount), 0) AS TaxableValue,
        COALESCE(SUM(Igst), 0) AS Igst,
        COALESCE(SUM(Cgst), 0) AS Cgst,
        COALESCE(SUM(Sgst), 0) AS Sgst
    FROM dbo.Sales
    WHERE Status = 'CONFIRMED' AND InvoiceDate >= @From AND InvoiceDate <= @To;

    SELECT c.State AS CustomerState, SUM(s.TaxableAmount) AS TaxableValue, SUM(s.Igst) AS Igst
    FROM dbo.Sales s
    LEFT JOIN dbo.Customers c ON c.Id = s.CustomerId
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To
      AND s.Igst > 0 AND NULLIF(LTRIM(RTRIM(c.Gstin)), '') IS NULL
    GROUP BY c.State
    ORDER BY SUM(s.TaxableAmount) DESC;

    SELECT
        COALESCE(SUM(Igst), 0) AS Igst,
        COALESCE(SUM(Cgst), 0) AS Cgst,
        COALESCE(SUM(Sgst), 0) AS Sgst,
        COALESCE(SUM(TaxableAmount), 0) AS TaxableValue
    FROM dbo.Purchases
    WHERE Status = 'CONFIRMED' AND PurchaseDate >= @From AND PurchaseDate <= @To;

    SELECT COALESCE(SUM(si.TaxableAmount), 0) AS NilRatedValue
    FROM dbo.Sales s
    JOIN dbo.SaleItems si ON si.SaleId = s.Id
    WHERE s.Status = 'CONFIRMED' AND s.InvoiceDate >= @From AND s.InvoiceDate <= @To AND si.GstRate = 0;
END
