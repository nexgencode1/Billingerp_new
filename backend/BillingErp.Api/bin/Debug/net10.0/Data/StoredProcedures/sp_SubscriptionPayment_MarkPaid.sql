-- Marks a subscription order as paid and assigns its billing period. Periods are contiguous: a new
-- period starts at the later of "now" and the end of the last PAID period of the same subscription
-- (so renewing early never loses days). The rows are locked so two concurrent confirmations
-- (checkout callback + webhook) cannot both extend the subscription. Idempotent per order.
-- @Result: 0 = paid now, 1 = already paid (no change), 2 = order not found,
--          3 = subscription already cancelled (payment recorded, no period; caller refunds it).
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_MarkPaid
    @RazorpayOrderId NVARCHAR(64),
    @RazorpayPaymentId NVARCHAR(64),
    @Signature NVARCHAR(200) = NULL,
    @Method NVARCHAR(30) = NULL,
    @Result INT OUTPUT,
    @PeriodStart DATETIME2 OUTPUT,
    @PeriodEnd DATETIME2 OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    DECLARE @PaymentId INT, @SubscriptionId INT, @Status NVARCHAR(20), @PlanId INT;
    SELECT @PaymentId = Id, @SubscriptionId = SubscriptionId, @Status = Status, @PlanId = PlanId
    FROM dbo.SubscriptionPayments WITH (UPDLOCK, HOLDLOCK)
    WHERE RazorpayOrderId = @RazorpayOrderId;

    IF @PaymentId IS NULL
    BEGIN
        SET @Result = 2;
        COMMIT TRANSACTION;
        RETURN;
    END

    DECLARE @SubscriptionStatus NVARCHAR(20);
    SELECT @SubscriptionStatus = Status FROM dbo.Subscriptions WITH (UPDLOCK, HOLDLOCK) WHERE Id = @SubscriptionId;

    IF @Status IN (N'PAID', N'REFUNDED')
    BEGIN
        SELECT @PeriodStart = PeriodStart, @PeriodEnd = PeriodEnd FROM dbo.SubscriptionPayments WHERE Id = @PaymentId;
        SET @Result = 1;
        COMMIT TRANSACTION;
        RETURN;
    END

    IF @SubscriptionStatus = N'CANCELLED'
    BEGIN
        UPDATE dbo.SubscriptionPayments
        SET Status = N'PAID', RazorpayPaymentId = @RazorpayPaymentId, RazorpaySignature = @Signature,
            Method = @Method, PaidAt = SYSUTCDATETIME(), ErrorDescription = NULL
        WHERE Id = @PaymentId;
        SET @Result = 3;
        COMMIT TRANSACTION;
        RETURN;
    END

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();

    -- A paid plan replaces a running free trial right away (the trial has no end date of its own).
    UPDATE p SET PeriodEnd = @Now
    FROM dbo.SubscriptionPayments p
    JOIN dbo.SubscriptionPlans pl ON pl.Id = p.PlanId
    WHERE p.SubscriptionId = @SubscriptionId AND p.Status = N'PAID' AND pl.Tier = N'TRIAL' AND p.PeriodEnd > @Now;

    DECLARE @LastEnd DATETIME2 = (
        SELECT MAX(PeriodEnd) FROM dbo.SubscriptionPayments
        WHERE SubscriptionId = @SubscriptionId AND Status = N'PAID');
    DECLARE @Months INT = (SELECT PeriodMonths FROM dbo.SubscriptionPlans WHERE Id = @PlanId);

    SET @PeriodStart = CASE WHEN @LastEnd IS NOT NULL AND @LastEnd > @Now THEN @LastEnd ELSE @Now END;
    SET @PeriodEnd = CASE WHEN @Months > 0 THEN DATEADD(MONTH, @Months, @PeriodStart) ELSE '9999-12-31' END;

    UPDATE dbo.SubscriptionPayments
    SET Status = N'PAID', RazorpayPaymentId = @RazorpayPaymentId, RazorpaySignature = @Signature,
        Method = @Method, PaidAt = @Now, PeriodStart = @PeriodStart, PeriodEnd = @PeriodEnd, ErrorDescription = NULL
    WHERE Id = @PaymentId;

    -- Paying again also undoes a pending "cancel at period end".
    UPDATE dbo.Subscriptions
    SET Status = N'ACTIVE', CancelAtPeriodEnd = 0, CancelRequestedAt = NULL, CancelReason = NULL, UpdatedAt = @Now
    WHERE Id = @SubscriptionId;

    SET @Result = 0;
    COMMIT TRANSACTION;
END
