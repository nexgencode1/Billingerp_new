-- Schedules (or undoes) "cancel at the end of the paid period". Access continues until then.
CREATE OR ALTER PROCEDURE dbo.sp_Subscription_SetCancelAtPeriodEnd
    @SubscriptionId INT,
    @Cancel BIT,
    @Reason NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Subscriptions
    SET CancelAtPeriodEnd = @Cancel,
        CancelRequestedAt = CASE WHEN @Cancel = 1 THEN SYSUTCDATETIME() ELSE NULL END,
        CancelReason = CASE WHEN @Cancel = 1 THEN @Reason ELSE NULL END,
        UpdatedAt = SYSUTCDATETIME()
    WHERE Id = @SubscriptionId AND Status = N'ACTIVE';
    SELECT @@ROWCOUNT AS Affected;
END
