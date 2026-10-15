-- Upserts HSN/SAC rows from a JSON array [{ code, description, gstRate }] in one statement
-- (the official list is ~20k rows, so row-by-row calls would be far too slow).
-- A NULL gstRate in the file never wipes a rate that is already stored.
CREATE OR ALTER PROCEDURE dbo.sp_Hsn_ImportBulk
    @RowsJson NVARCHAR(MAX),
    @Inserted INT OUTPUT,
    @Updated INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Actions TABLE (Act NVARCHAR(10));

    BEGIN TRAN;

    MERGE dbo.HsnCodes WITH (HOLDLOCK) AS target
    USING (
        SELECT Code, MAX(Description) AS Description, MAX(GstRate) AS GstRate
        FROM OPENJSON(@RowsJson) WITH (
            Code NVARCHAR(10) '$.code',
            Description NVARCHAR(MAX) '$.description',
            GstRate DECIMAL(5,2) '$.gstRate'
        )
        WHERE Code IS NOT NULL AND LEN(Code) > 0
        GROUP BY Code
    ) AS src
    ON target.Code = src.Code
    WHEN MATCHED THEN
        UPDATE SET Description = COALESCE(NULLIF(src.Description, ''), target.Description),
                   GstRate = COALESCE(src.GstRate, target.GstRate),
                   UpdatedAt = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (Code, Description, GstRate, UpdatedAt)
        VALUES (src.Code, COALESCE(src.Description, ''), src.GstRate, SYSUTCDATETIME())
    OUTPUT $action INTO @Actions;

    COMMIT TRAN;

    SELECT @Inserted = SUM(CASE WHEN Act = 'INSERT' THEN 1 ELSE 0 END),
           @Updated = SUM(CASE WHEN Act = 'UPDATE' THEN 1 ELSE 0 END)
    FROM @Actions;
    SET @Inserted = COALESCE(@Inserted, 0);
    SET @Updated = COALESCE(@Updated, 0);
END
