-- Portal accounts whose customer mobile matches (compared on the last 10 digits, so "+91 98…",
-- "098…" and "98…" all match). More than one row means the number is ambiguous — the caller refuses.
CREATE OR ALTER PROCEDURE dbo.sp_Portal_FindByMobile
    @Mobile NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Digits NVARCHAR(30) = @Mobile;
    -- strip everything except digits
    WHILE PATINDEX('%[^0-9]%', @Digits) > 0
        SET @Digits = STUFF(@Digits, PATINDEX('%[^0-9]%', @Digits), 1, '');
    DECLARE @Last10 NVARCHAR(10) = RIGHT(@Digits, 10);

    IF LEN(@Last10) < 10
    BEGIN
        SELECT TOP 0 a.CustomerId, c.Name, a.PasswordHash, a.IsEnabled, a.FailedAttempts, a.LockedUntil
        FROM dbo.CustomerPortalAccounts a JOIN dbo.Customers c ON c.Id = a.CustomerId;
        RETURN;
    END

    SELECT a.CustomerId, c.Name, a.PasswordHash, a.IsEnabled, a.FailedAttempts, a.LockedUntil
    FROM dbo.CustomerPortalAccounts a
    JOIN dbo.Customers c ON c.Id = a.CustomerId
    WHERE c.Status = 1
      AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(c.Mobile, ' ', ''), '-', ''), '+', ''), '(', ''), 10) = @Last10;
END
