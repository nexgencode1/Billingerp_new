-- Webhook refund.processed / refund.failed updates.
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_UpdateRefundStatus
    @RefundId NVARCHAR(64),
    @RefundStatus NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.SubscriptionPayments SET RefundStatus = @RefundStatus WHERE RefundId = @RefundId;
END
