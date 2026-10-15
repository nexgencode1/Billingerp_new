-- List of one document type, newest first, with customer name and (if converted) the invoice no.
-- Optional filters: date range, status, customer. NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_SalesDocument_List
    @DocType NVARCHAR(30),
    @From DATETIME2 = NULL,
    @To DATETIME2 = NULL,
    @Status NVARCHAR(20) = NULL,
    @CustomerId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.Id, d.DocType, d.DocNumber, d.DocDate, d.DueDate, d.CustomerId, c.Name AS CustomerName,
        d.Subtotal, d.Discount, d.TaxableAmount, d.Cgst, d.Sgst, d.Igst, d.GrandTotal,
        d.Status, d.ConvertedSaleId, s.InvoiceNumber AS ConvertedInvoiceNumber, d.Notes,
        d.CreatedById, u.Name AS CreatedByName, d.CreatedAt,
        (SELECT COUNT(*) FROM dbo.SalesDocumentItems i WHERE i.SalesDocumentId = d.Id) AS ItemCount
    FROM dbo.SalesDocuments d
    LEFT JOIN dbo.Customers c ON c.Id = d.CustomerId
    LEFT JOIN dbo.Sales s ON s.Id = d.ConvertedSaleId
    JOIN dbo.Users u ON u.Id = d.CreatedById
    WHERE d.DocType = @DocType
      AND (@From IS NULL OR d.DocDate >= @From)
      AND (@To IS NULL OR d.DocDate <= @To)
      AND (@Status IS NULL OR d.Status = @Status)
      AND (@CustomerId IS NULL OR d.CustomerId = @CustomerId)
    ORDER BY d.DocDate DESC, d.Id DESC;
END
