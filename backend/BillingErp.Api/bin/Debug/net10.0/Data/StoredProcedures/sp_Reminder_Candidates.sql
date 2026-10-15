-- Customers with unpaid invoices older than @OlderThanDays.
-- 1) one row per customer: totals, oldest invoice, contact details, last reminder sent
-- 2) the unpaid invoices themselves (for the email body / expandable rows)
-- @CustomerId narrows both sets to one customer.
CREATE OR ALTER PROCEDURE dbo.sp_Reminder_Candidates
    @OlderThanDays INT = 0,
    @CustomerId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Cutoff DATETIME2 = DATEADD(DAY, -@OlderThanDays, CAST(SYSDATETIME() AS DATE));

    DECLARE @Due TABLE (SaleId INT PRIMARY KEY, CustomerId INT, InvoiceNumber NVARCHAR(50), InvoiceDate DATETIME2, GrandTotal DECIMAL(18,2), DueAmount DECIMAL(18,2));
    INSERT INTO @Due
    SELECT s.Id, s.CustomerId, s.InvoiceNumber, s.InvoiceDate, s.GrandTotal, s.DueAmount
    FROM dbo.Sales s
    WHERE s.Status = 'CONFIRMED' AND s.DueAmount > 0 AND s.CustomerId IS NOT NULL
      AND s.InvoiceDate < @Cutoff
      AND (@CustomerId IS NULL OR s.CustomerId = @CustomerId);

    SELECT
        c.Id AS CustomerId, c.Name, c.Mobile, NULLIF(LTRIM(RTRIM(c.Email)), '') AS Email,
        COUNT(*) AS InvoiceCount, SUM(d.DueAmount) AS TotalDue, MIN(d.InvoiceDate) AS OldestInvoiceDate,
        DATEDIFF(DAY, MIN(d.InvoiceDate), SYSDATETIME()) AS OldestDays,
        (SELECT MAX(r.SentAt) FROM dbo.PaymentReminders r WHERE r.CustomerId = c.Id AND r.Status = 'SENT') AS LastRemindedAt,
        (SELECT TOP 1 r.Channel FROM dbo.PaymentReminders r WHERE r.CustomerId = c.Id AND r.Status = 'SENT' ORDER BY r.SentAt DESC) AS LastChannel
    FROM @Due d
    JOIN dbo.Customers c ON c.Id = d.CustomerId
    GROUP BY c.Id, c.Name, c.Mobile, c.Email
    ORDER BY SUM(d.DueAmount) DESC;

    SELECT SaleId, CustomerId, InvoiceNumber, InvoiceDate, GrandTotal, DueAmount,
           DATEDIFF(DAY, InvoiceDate, SYSDATETIME()) AS DaysOld
    FROM @Due
    ORDER BY CustomerId, InvoiceDate;
END
