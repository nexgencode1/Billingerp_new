-- Records a reminder (one row per invoice it covered). @SaleIdsJson = JSON array of sale ids.
CREATE OR ALTER PROCEDURE dbo.sp_Reminder_Log
    @CustomerId INT,
    @SaleIdsJson NVARCHAR(MAX),
    @Channel NVARCHAR(20),
    @Status NVARCHAR(20),
    @Error NVARCHAR(1000) = NULL,
    @IsAutomatic BIT = 0,
    @CreatedById INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.PaymentReminders (SaleId, CustomerId, Channel, Status, Error, IsAutomatic, CreatedById, SentAt)
    SELECT CAST(j.value AS INT), @CustomerId, @Channel, @Status, @Error, @IsAutomatic, @CreatedById, SYSUTCDATETIME()
    FROM OPENJSON(@SaleIdsJson) j
    WHERE EXISTS (SELECT 1 FROM dbo.Sales s WHERE s.Id = CAST(j.value AS INT) AND s.CustomerId = @CustomerId);
END
