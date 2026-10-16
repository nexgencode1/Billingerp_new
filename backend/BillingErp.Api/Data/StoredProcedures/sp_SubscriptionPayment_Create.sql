-- Records a Razorpay Order created for a subscription period. @SubscriptionId NULL starts a new
-- PENDING subscription in the same transaction.
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPayment_Create
    @SubscriptionId INT = NULL,
    @PlanId INT,
    @Purpose NVARCHAR(20),
    @Amount DECIMAL(18,2),
    @Currency NVARCHAR(10),
    @RazorpayOrderId NVARCHAR(64),
    @UserId INT = NULL,
    @OutSubscriptionId INT OUTPUT,
    @OutPaymentId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    IF @SubscriptionId IS NULL
    BEGIN
        INSERT INTO dbo.Subscriptions (Status, CancelAtPeriodEnd, CreatedById, CreatedAt, UpdatedAt)
        VALUES (N'PENDING', 0, @UserId, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @SubscriptionId = SCOPE_IDENTITY();
    END
    ELSE IF NOT EXISTS (SELECT 1 FROM dbo.Subscriptions WHERE Id = @SubscriptionId AND Status <> N'CANCELLED')
        THROW 51101, 'Subscription is not open for payments.', 1;

    INSERT INTO dbo.SubscriptionPayments
        (SubscriptionId, PlanId, Purpose, Status, Amount, Currency, RazorpayOrderId, CreatedById, CreatedAt)
    VALUES (@SubscriptionId, @PlanId, @Purpose, N'CREATED', @Amount, @Currency, @RazorpayOrderId, @UserId, SYSUTCDATETIME());

    SET @OutPaymentId = SCOPE_IDENTITY();
    SET @OutSubscriptionId = @SubscriptionId;
    COMMIT TRANSACTION;
END
