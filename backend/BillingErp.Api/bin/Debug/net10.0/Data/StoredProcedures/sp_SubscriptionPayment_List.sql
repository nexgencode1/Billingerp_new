-- Subscription payments, newest first. @SubscriptionId NULL = history across every subscription.
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_List
    @SubscriptionId INT = NULL,
    @Top INT = 100
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Top)
           p.Id, p.SubscriptionId, p.PlanId, pl.Name AS PlanName, pl.PeriodMonths, pl.Tier, p.Purpose, p.Status,
           p.Amount, p.Currency, p.RazorpayOrderId, p.RazorpayPaymentId, p.Method, p.PeriodStart, p.PeriodEnd,
           p.ErrorDescription, p.RefundId, p.RefundAmount, p.RefundStatus, p.RefundedAt, p.CreatedAt, p.PaidAt
    FROM dbo.SubscriptionPayments p
    JOIN dbo.SubscriptionPlans pl ON pl.Id = p.PlanId
    WHERE @SubscriptionId IS NULL OR p.SubscriptionId = @SubscriptionId
    ORDER BY p.Id DESC;
END
