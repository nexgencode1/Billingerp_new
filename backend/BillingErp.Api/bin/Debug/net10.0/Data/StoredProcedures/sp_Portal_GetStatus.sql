-- Portal access status for the staff screen (no password hash returned).
CREATE OR ALTER PROCEDURE dbo.sp_Portal_GetStatus
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.Id AS CustomerId, c.Name, c.Mobile,
           CAST(CASE WHEN a.CustomerId IS NULL THEN 0 ELSE 1 END AS BIT) AS HasAccount,
           COALESCE(a.IsEnabled, CAST(0 AS BIT)) AS IsEnabled,
           a.LastLoginAt, a.LockedUntil
    FROM dbo.Customers c
    LEFT JOIN dbo.CustomerPortalAccounts a ON a.CustomerId = c.Id
    WHERE c.Id = @CustomerId;
END
