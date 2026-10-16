-- Stores the outcome of a Razorpay refund call. A refund id marks the payment REFUNDED; otherwise
-- only the error is kept so the refund can be retried.
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_SetRefund
    @PaymentId INT,
    @RefundId NVARCHAR(64) = NULL,
    @RefundAmount DECIMAL(18,2) = NULL,
    @RefundStatus NVARCHAR(30) = NULL,
    @Error NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @RefundId IS NOT NULL
        UPDATE dbo.SubscriptionPayments
        SET Status = N'REFUNDED', RefundId = @RefundId, RefundAmount = @RefundAmount,
            RefundStatus = @RefundStatus, RefundedAt = SYSUTCDATETIME(), ErrorDescription = NULL
        WHERE Id = @PaymentId AND Status = N'PAID';
    ELSE
        UPDATE dbo.SubscriptionPayments SET ErrorDescription = @Error WHERE Id = @PaymentId;
END
