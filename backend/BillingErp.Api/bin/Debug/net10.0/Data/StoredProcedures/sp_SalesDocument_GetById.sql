-- 3 result sets: 1) header (+ converted invoice no, creator name), 2) customer, 3) items with
-- the product's current unit/HSN/stock (used to prefill the invoice form on conversion).
CREATE OR ALTER PROCEDURE dbo.sp_SalesDocument_GetById
    @DocumentId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.Id, d.DocType, d.DocNumber, d.DocDate, d.DueDate, d.CustomerId,
        d.Subtotal, d.Discount, d.TaxableAmount, d.Cgst, d.Sgst, d.Igst, d.GrandTotal,
        d.Status, d.ConvertedSaleId, s.InvoiceNumber AS ConvertedInvoiceNumber, d.Notes,
        d.CreatedById, u.Name AS CreatedByName, d.CreatedAt
    FROM dbo.SalesDocuments d
    LEFT JOIN dbo.Sales s ON s.Id = d.ConvertedSaleId
    JOIN dbo.Users u ON u.Id = d.CreatedById
    WHERE d.Id = @DocumentId;

    SELECT c.Id, c.Name, c.Mobile, c.Email, c.Address, c.City, c.State, c.Pincode, c.Gstin
    FROM dbo.Customers c
    WHERE c.Id = (SELECT CustomerId FROM dbo.SalesDocuments WHERE Id = @DocumentId);

    SELECT
        i.Id, i.ProductId, i.ProductName, i.Quantity, i.Rate, i.Discount, i.GstRate,
        i.TaxableAmount, i.GstAmount, i.Total,
        p.Sku, p.HsnCode, un.Name AS UnitName, un.ShortName AS UnitShortName,
        COALESCE(st.Balance, 0) AS CurrentStock
    FROM dbo.SalesDocumentItems i
    JOIN dbo.Products p ON p.Id = i.ProductId
    JOIN dbo.Units un ON un.Id = p.UnitId
    OUTER APPLY (
        SELECT SUM(t.QuantityIn) - SUM(t.QuantityOut) AS Balance
        FROM dbo.StockTransactions t WHERE t.ProductId = i.ProductId
    ) st
    WHERE i.SalesDocumentId = @DocumentId
    ORDER BY i.Id;
END
