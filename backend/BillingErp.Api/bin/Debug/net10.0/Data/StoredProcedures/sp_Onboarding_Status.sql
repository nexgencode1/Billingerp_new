-- "Getting started" checklist on the dashboard: which first-time setup steps already have real data.
CREATE OR ALTER PROCEDURE dbo.sp_Onboarding_Status
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.Businesses
            WHERE LEN(LTRIM(Name)) > 0 AND LEN(LTRIM(ISNULL(State, N''))) > 0
              AND LEN(LTRIM(ISNULL(Phone, N''))) > 0 AND LEN(LTRIM(ISNULL(Address, N''))) > 0)
            THEN 1 ELSE 0 END AS BIT) AS BusinessProfile,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Products WHERE Status = 1) THEN 1 ELSE 0 END AS BIT) AS HasProducts,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Customers WHERE Status = 1) THEN 1 ELSE 0 END AS BIT) AS HasCustomers,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Sales WHERE Status <> N'CANCELLED') THEN 1 ELSE 0 END AS BIT) AS HasSales,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Payments WHERE Direction = N'RECEIVE') THEN 1 ELSE 0 END AS BIT) AS HasPaymentsReceived,
        CAST(CASE WHEN (SELECT COUNT(*) FROM dbo.Users WHERE Status = 1) > 1 THEN 1 ELSE 0 END AS BIT) AS HasTeam;
END
