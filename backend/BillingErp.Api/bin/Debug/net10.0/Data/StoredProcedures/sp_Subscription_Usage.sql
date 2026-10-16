-- Plan usage counters: invoices created since @InvoiceSince (by creation time, so backdated
-- invoice dates still count) and currently active users.
CREATE OR ALTER PROCEDURE dbo.sp_Subscription_Usage
    @InvoiceSince DATETIME2
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM dbo.Sales WHERE CreatedAt >= @InvoiceSince) AS InvoicesUsed,
        (SELECT COUNT(*) FROM dbo.Users WHERE Status = 1) AS ActiveUsers;
END
