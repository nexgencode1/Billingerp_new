-- HSN suggestions for the product form, from two sources:
--  1) 'HISTORY' — HSN + GST rate already used on your own products (most-used first), matched on
--     product name words or the code itself;
--  2) 'MASTER'  — the imported HSN master list, matched on code prefix or description text.
-- @Query is a product name or partial code. Returns at most @Max rows per source.
CREATE OR ALTER PROCEDURE dbo.sp_Hsn_Suggest
    @Query NVARCHAR(200),
    @Max INT = 8
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Q NVARCHAR(200) = LTRIM(RTRIM(@Query));
    IF LEN(@Q) < 2
    BEGIN
        SELECT TOP 0 CAST('' AS NVARCHAR(10)) AS Code, CAST('' AS NVARCHAR(MAX)) AS Description,
               CAST(NULL AS DECIMAL(5,2)) AS GstRate, CAST('' AS NVARCHAR(10)) AS Source, 0 AS UsageCount;
        RETURN;
    END

    DECLARE @Like NVARCHAR(210) = N'%' + @Q + N'%';
    DECLARE @Prefix NVARCHAR(210) = @Q + N'%';
    -- First word of the query (e.g. "Samsung" from "Samsung Galaxy A15") for looser history matches.
    DECLARE @FirstWord NVARCHAR(200) = CASE WHEN CHARINDEX(' ', @Q) > 0 THEN LEFT(@Q, CHARINDEX(' ', @Q) - 1) ELSE @Q END;
    DECLARE @WordLike NVARCHAR(210) = N'%' + @FirstWord + N'%';

    SELECT TOP (@Max) Code, Description, GstRate, Source, UsageCount
    FROM (
        SELECT
            LTRIM(RTRIM(p.HsnCode)) AS Code,
            MIN(p.Name) AS Description,
            MAX(p.GstRate) AS GstRate,
            'HISTORY' AS Source,
            COUNT(*) AS UsageCount,
            MAX(CASE WHEN p.Name LIKE @Like OR p.HsnCode LIKE @Prefix THEN 1 ELSE 0 END) AS Strong
        FROM dbo.Products p
        WHERE NULLIF(LTRIM(RTRIM(p.HsnCode)), '') IS NOT NULL
          AND (p.Name LIKE @Like OR p.HsnCode LIKE @Prefix OR (LEN(@FirstWord) >= 3 AND p.Name LIKE @WordLike))
        GROUP BY LTRIM(RTRIM(p.HsnCode)), p.GstRate
    ) h
    ORDER BY Strong DESC, UsageCount DESC, Code;

    SELECT TOP (@Max) Code, Description, GstRate, 'MASTER' AS Source, 0 AS UsageCount
    FROM dbo.HsnCodes
    WHERE Code LIKE @Prefix OR Description LIKE @Like
    ORDER BY CASE WHEN Code LIKE @Prefix THEN 0 ELSE 1 END, LEN(Code), Code;

    SELECT COUNT(*) AS MasterCount FROM dbo.HsnCodes;
END
