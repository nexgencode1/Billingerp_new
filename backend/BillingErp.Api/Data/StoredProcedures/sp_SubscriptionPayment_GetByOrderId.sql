CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_GetByOrderId
    @RazorpayOrderId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.Id, p.SubscriptionId, p.PlanId, p.Status, p.Amount, p.Currency, p.RazorpayOrderId, p.RazorpayPaymentId,
           s.Status AS SubscriptionStatus
    FROM dbo.SubscriptionPayments p
    JOIN dbo.Subscriptions s ON s.Id = p.SubscriptionId
    WHERE p.RazorpayOrderId = @RazorpayOrderId;
END
