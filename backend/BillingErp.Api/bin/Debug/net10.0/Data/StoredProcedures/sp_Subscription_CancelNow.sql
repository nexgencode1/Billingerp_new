-- Ends the subscription immediately. Refunds (if any) are issued by the caller per payment.
CREATE OR ALTER PROCEDURE dbo.sp_Subscription_CancelNow
    @SubscriptionId INT,
    @Reason NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Subscriptions
    SET Status = N'CANCELLED', CancelledAt = SYSUTCDATETIME(), CancelReason = COALESCE(@Reason, CancelReason),
        CancelAtPeriodEnd = 0, UpdatedAt = SYSUTCDATETIME()
    WHERE Id = @SubscriptionId AND Status <> N'CANCELLED';
    SELECT @@ROWCOUNT AS Affected;
END
