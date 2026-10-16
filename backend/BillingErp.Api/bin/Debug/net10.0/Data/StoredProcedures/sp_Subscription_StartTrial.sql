-- Starts the one-time free trial: a zero-amount PAID period with no end date (it ends when its bill
-- allowance is used, or when a paid plan replaces it — see sp_SubscriptionPayment_MarkPaid). An app
-- lock serialises concurrent clicks so the trial can never be granted twice.
-- @Result: 0 = started, 1 = trial already used, 2 = trial plan missing/inactive.
CREATE OR ALTER PROCEDURE dbo.sp_Subscription_StartTrial
    @UserId INT = NULL,
    @Reference NVARCHAR(64),
    @Result INT OUTPUT,
    @OutSubscriptionId INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    EXEC sp_getapplock @Resource = N'subscription-trial', @LockMode = N'Exclusive', @LockOwner = N'Transaction';

    DECLARE @PlanId INT, @Currency NVARCHAR(10);
    SELECT TOP 1 @PlanId = Id, @Currency = Currency FROM dbo.SubscriptionPlans WHERE Tier = N'TRIAL' AND IsActive = 1 ORDER BY SortOrder, Id;
    IF @PlanId IS NULL
    BEGIN
        SET @Result = 2;
        COMMIT TRANSACTION;
        RETURN;
    END

    IF EXISTS (
        SELECT 1 FROM dbo.SubscriptionPayments p JOIN dbo.SubscriptionPlans pl ON pl.Id = p.PlanId
        WHERE pl.Tier = N'TRIAL' AND p.Status = N'PAID')
    BEGIN
        SET @Result = 1;
        COMMIT TRANSACTION;
        RETURN;
    END

    -- Reuse an unpaid PENDING subscription (abandoned checkout) instead of leaving it dangling.
    DECLARE @SubscriptionId INT = (SELECT TOP 1 Id FROM dbo.Subscriptions WHERE Status = N'PENDING' ORDER BY Id DESC);
    IF @SubscriptionId IS NULL OR @SubscriptionId <> (SELECT MAX(Id) FROM dbo.Subscriptions)
    BEGIN
        INSERT INTO dbo.Subscriptions (Status, CancelAtPeriodEnd, CreatedById, CreatedAt, UpdatedAt)
        VALUES (N'ACTIVE', 0, @UserId, SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @SubscriptionId = SCOPE_IDENTITY();
    END
    ELSE
        UPDATE dbo.Subscriptions SET Status = N'ACTIVE', UpdatedAt = SYSUTCDATETIME() WHERE Id = @SubscriptionId;

    DECLARE @Now DATETIME2 = SYSUTCDATETIME();
    INSERT INTO dbo.SubscriptionPayments
        (SubscriptionId, PlanId, Purpose, Status, Amount, Currency, RazorpayOrderId, PeriodStart, PeriodEnd, CreatedById, CreatedAt, PaidAt)
    VALUES (@SubscriptionId, @PlanId, N'TRIAL', N'PAID', 0, @Currency, @Reference, @Now, '9999-12-31', @UserId, @Now, @Now);

    SET @OutSubscriptionId = @SubscriptionId;
    SET @Result = 0;
    COMMIT TRANSACTION;
END
