-- Records one run of a recurring template. On success (@SaleId set) advances NextRunDate and the
-- counters; on failure only stores @Error (NextRunDate stays, so the next worker pass retries).
-- @Deactivate = 1 when the schedule has passed its EndDate.
CREATE OR ALTER PROCEDURE dbo.sp_Recurring_RecordRun
    @RecurringId INT,
    @SaleId INT = NULL,
    @NextRunDate DATETIME2 = NULL,
    @Error NVARCHAR(1000) = NULL,
    @Deactivate BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @SaleId IS NOT NULL
        UPDATE dbo.RecurringInvoices
        SET LastRunAt = SYSUTCDATETIME(), LastSaleId = @SaleId, LastError = NULL, RunCount = RunCount + 1,
            NextRunDate = COALESCE(@NextRunDate, NextRunDate),
            IsActive = CASE WHEN @Deactivate = 1 THEN 0 ELSE IsActive END
        WHERE Id = @RecurringId;
    ELSE
        UPDATE dbo.RecurringInvoices
        SET LastRunAt = SYSUTCDATETIME(), LastError = @Error,
            IsActive = CASE WHEN @Deactivate = 1 THEN 0 ELSE IsActive END
        WHERE Id = @RecurringId;
END
