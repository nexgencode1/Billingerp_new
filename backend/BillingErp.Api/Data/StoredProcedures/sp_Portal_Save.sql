-- Enables/disables portal access for a customer and optionally sets a new password hash.
-- Creating access requires a password. Setting a password also clears any lockout.
-- @Result: 0 = ok, 1 = customer not found, 2 = password required for first-time setup.
CREATE OR ALTER PROCEDURE dbo.sp_Portal_Save
    @CustomerId INT,
    @PasswordHash NVARCHAR(200) = NULL,
    @IsEnabled BIT,
    @Result INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE Id = @CustomerId)
    BEGIN
        SET @Result = 1;
        RETURN;
    END

    IF EXISTS (SELECT 1 FROM dbo.CustomerPortalAccounts WHERE CustomerId = @CustomerId)
        UPDATE dbo.CustomerPortalAccounts
        SET IsEnabled = @IsEnabled,
            PasswordHash = COALESCE(@PasswordHash, PasswordHash),
            FailedAttempts = CASE WHEN @PasswordHash IS NOT NULL THEN 0 ELSE FailedAttempts END,
            LockedUntil = CASE WHEN @PasswordHash IS NOT NULL THEN NULL ELSE LockedUntil END,
            UpdatedAt = SYSUTCDATETIME()
        WHERE CustomerId = @CustomerId;
    ELSE
    BEGIN
        IF @PasswordHash IS NULL
        BEGIN
            SET @Result = 2;
            RETURN;
        END
        INSERT INTO dbo.CustomerPortalAccounts (CustomerId, PasswordHash, IsEnabled, FailedAttempts, CreatedAt, UpdatedAt)
        VALUES (@CustomerId, @PasswordHash, @IsEnabled, 0, SYSUTCDATETIME(), SYSUTCDATETIME());
    END

    SET @Result = 0;
END
