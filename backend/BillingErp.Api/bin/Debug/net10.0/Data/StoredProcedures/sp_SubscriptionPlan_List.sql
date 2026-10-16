-- Software subscription plans, in display order.
CREATE OR ALTER PROCEDURE dbo.sp_SubscriptionPlan_List
    @ActiveOnly BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Code, Name, Description, Price, Currency, PeriodMonths, Features, Tier, InvoiceLimit, InvoiceLimitPeriod,
           MaxUsers, LockedFeatures, IsActive, SortOrder
    FROM dbo.SubscriptionPlans
    WHERE @ActiveOnly = 0 OR IsActive = 1
    ORDER BY SortOrder, Id;
END
