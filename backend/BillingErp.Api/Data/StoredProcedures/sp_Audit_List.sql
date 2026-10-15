-- Audit trail, newest first, capped at @MaxRows. Optional filters: module, user, action (NULL = all).
-- Result set 2: distinct modules / actions present, for the filter dropdowns.
CREATE OR ALTER PROCEDURE dbo.sp_Audit_List
    @From DATETIME2,
    @To DATETIME2,
    @Module NVARCHAR(50) = NULL,
    @UserId INT = NULL,
    @Action NVARCHAR(50) = NULL,
    @MaxRows INT = 2000
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@MaxRows)
        a.Id, a.CreatedAt, a.UserId, u.Name AS UserName, u.Email AS UserEmail,
        a.Action, a.Module, a.RecordId, a.RecordLabel, a.IpAddress
    FROM dbo.AuditLogs a
    LEFT JOIN dbo.Users u ON u.Id = a.UserId
    WHERE a.CreatedAt >= @From AND a.CreatedAt <= @To
      AND (@Module IS NULL OR a.Module = @Module)
      AND (@UserId IS NULL OR a.UserId = @UserId)
      AND (@Action IS NULL OR a.Action = @Action)
    ORDER BY a.CreatedAt DESC, a.Id DESC;

    SELECT DISTINCT 'MODULE' AS Kind, Module AS Value FROM dbo.AuditLogs
    UNION
    SELECT DISTINCT 'ACTION', Action FROM dbo.AuditLogs;
END
