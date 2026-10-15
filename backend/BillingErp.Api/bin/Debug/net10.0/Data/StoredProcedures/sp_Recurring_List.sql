-- Recurring invoice templates with customer, item count, per-run value (pre-tax) and last invoice.
-- @DueOnly = 1 → only active templates whose NextRunDate is on/before @AsOf and within EndDate
-- (used by RecurringInvoiceWorker). Result set 2: items for the returned templates.
CREATE OR ALTER PROCEDURE dbo.sp_Recurring_List
    @DueOnly BIT = 0,
    @AsOf DATETIME2 = NULL,
    @RecurringId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Ids TABLE (Id INT PRIMARY KEY);
    INSERT INTO @Ids (Id)
    SELECT r.Id
    FROM dbo.RecurringInvoices r
    WHERE (@RecurringId IS NULL OR r.Id = @RecurringId)
      AND (@DueOnly = 0 OR (r.IsActive = 1 AND r.NextRunDate <= @AsOf AND (r.EndDate IS NULL OR r.NextRunDate <= r.EndDate)));

    SELECT
        r.Id, r.Name, r.CustomerId, c.Name AS CustomerName, r.Frequency, r.StartDate, r.EndDate, r.NextRunDate,
        r.IsActive, r.LastRunAt, r.LastSaleId, s.InvoiceNumber AS LastInvoiceNumber, r.LastError, r.RunCount, r.Notes,
        r.CreatedById, r.CreatedAt,
        (SELECT COUNT(*) FROM dbo.RecurringInvoiceItems i WHERE i.RecurringInvoiceId = r.Id) AS ItemCount,
        (SELECT COALESCE(SUM(i.Quantity * i.Rate - i.Discount), 0) FROM dbo.RecurringInvoiceItems i WHERE i.RecurringInvoiceId = r.Id) AS TaxableValue
    FROM dbo.RecurringInvoices r
    JOIN @Ids x ON x.Id = r.Id
    JOIN dbo.Customers c ON c.Id = r.CustomerId
    LEFT JOIN dbo.Sales s ON s.Id = r.LastSaleId
    ORDER BY r.IsActive DESC, r.NextRunDate;

    SELECT i.Id, i.RecurringInvoiceId, i.ProductId, i.ProductName, i.Quantity, i.Rate, i.Discount, i.GstRate
    FROM dbo.RecurringInvoiceItems i
    JOIN @Ids x ON x.Id = i.RecurringInvoiceId
    ORDER BY i.RecurringInvoiceId, i.Id;
END
