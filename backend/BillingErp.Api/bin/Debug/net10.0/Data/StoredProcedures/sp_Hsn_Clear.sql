-- Empties the HSN master (before re-importing a fresh official list). Products keep their HSN codes.
CREATE OR ALTER PROCEDURE dbo.sp_Hsn_Clear
    @Deleted INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.HsnCodes;
    SET @Deleted = @@ROWCOUNT;
END
