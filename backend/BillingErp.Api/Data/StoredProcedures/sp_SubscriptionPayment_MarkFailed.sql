-- Records a failed checkout attempt. Only an unpaid order changes; the same order can still be
-- paid on a retry (sp_SubscriptionPayment_MarkPaid accepts FAILED -> PAID).
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_MarkFailed
    @RazorpayOrderId NVARCHAR(64),
    @RazorpayPaymentId NVARCHAR(64) = NULL,
    @Error NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SubscriptionPayments
    SET Status = N'FAILED', ErrorDescription = @Error
    WHERE RazorpayOrderId = @RazorpayOrderId AND Status IN (N'CREATED', N'FAILED');
    SELECT @@ROWCOUNT AS Affected;
END
