-- Deletes a recurring template (its items cascade). Invoices it already created are untouched.
CREATE OR ALTER PROCEDURE dbo.sp_Recurring_Delete
    @RecurringId INT,
    @Deleted BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.RecurringInvoices WHERE Id = @RecurringId;
    SET @Deleted = CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END;
END
