-- The most recent subscription row (the "current" lifecycle). Paid-until / current plan are derived
-- from its PAID payments by the caller (see sp_SubscriptionPayment_List).
CREATE OR ALTER PROCEDURE dbo.sp_Subscription_GetLatest
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 Id, Status, CancelAtPeriodEnd, CancelRequestedAt, CancelledAt, CancelReason, CreatedAt, UpdatedAt
    FROM dbo.Subscriptions
    ORDER BY Id DESC;
END
