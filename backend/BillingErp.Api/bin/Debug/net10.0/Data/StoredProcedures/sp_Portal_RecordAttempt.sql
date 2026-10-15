-- Records a portal login attempt. Success resets the failure counter; @MaxFailures consecutive
-- failures lock the account for @LockMinutes.
CREATE OR ALTER PROCEDURE dbo.sp_Portal_RecordAttempt
    @CustomerId INT,
    @Success BIT,
    @MaxFailures INT = 5,
    @LockMinutes INT = 15
AS
BEGIN
    SET NOCOUNT ON;

    IF @Success = 1
        UPDATE dbo.CustomerPortalAccounts
        SET FailedAttempts = 0, LockedUntil = NULL, LastLoginAt = SYSUTCDATETIME()
        WHERE CustomerId = @CustomerId;
    ELSE
        UPDATE dbo.CustomerPortalAccounts
        SET FailedAttempts = FailedAttempts + 1,
            LockedUntil = CASE WHEN FailedAttempts + 1 >= @MaxFailures THEN DATEADD(MINUTE, @LockMinutes, SYSUTCDATETIME()) ELSE LockedUntil END
        WHERE CustomerId = @CustomerId;
END
