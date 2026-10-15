-- Business name + UPI ID for reminder messages.
CREATE OR ALTER PROCEDURE dbo.sp_Business_ReminderInfo
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 Name, UpiId FROM dbo.Businesses;
END
