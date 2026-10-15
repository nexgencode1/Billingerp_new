-- Only an OPEN document can be cancelled. @Result: 0 = ok, 1 = not found, 2 = not open.
CREATE OR ALTER PROCEDURE dbo.sp_SalesDocument_Cancel
    @DocumentId INT,
    @Result INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Status NVARCHAR(20);
    SELECT @Status = Status FROM dbo.SalesDocuments WITH (UPDLOCK) WHERE Id = @DocumentId;

    IF @Status IS NULL BEGIN SET @Result = 1; RETURN; END
    IF @Status <> 'OPEN' BEGIN SET @Result = 2; RETURN; END

    UPDATE dbo.SalesDocuments SET Status = 'CANCELLED' WHERE Id = @DocumentId;
    SET @Result = 0;
END
