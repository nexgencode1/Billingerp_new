-- Manual cash/bank entry. TRANSFER needs both accounts (different), ADJUST_IN only @ToAccountId,
-- ADJUST_OUT only @FromAccountId. @Result: 0 = ok, 1 = invalid accounts for this type.
CREATE OR ALTER PROCEDURE dbo.sp_CashBank_TransactionCreate
    @Type NVARCHAR(20),
    @FromAccountId INT = NULL,
    @ToAccountId INT = NULL,
    @Amount DECIMAL(18,2),
    @Date DATETIME2,
    @Note NVARCHAR(500) = NULL,
    @CreatedById INT,
    @TransactionId INT OUTPUT,
    @Result INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @FromOk BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.MoneyAccounts WHERE Id = @FromAccountId AND Status = 1) THEN 1 ELSE 0 END;
    DECLARE @ToOk BIT = CASE WHEN EXISTS (SELECT 1 FROM dbo.MoneyAccounts WHERE Id = @ToAccountId AND Status = 1) THEN 1 ELSE 0 END;

    IF (@Type = 'TRANSFER' AND (@FromOk = 0 OR @ToOk = 0 OR @FromAccountId = @ToAccountId))
       OR (@Type = 'ADJUST_IN' AND (@ToOk = 0 OR @FromAccountId IS NOT NULL))
       OR (@Type = 'ADJUST_OUT' AND (@FromOk = 0 OR @ToAccountId IS NOT NULL))
       OR @Type NOT IN ('TRANSFER', 'ADJUST_IN', 'ADJUST_OUT')
    BEGIN
        SET @Result = 1;
        RETURN;
    END

    INSERT INTO dbo.CashBankTransactions (Date, Type, FromAccountId, ToAccountId, Amount, Note, CreatedById, CreatedAt)
    VALUES (@Date, @Type, @FromAccountId, @ToAccountId, @Amount, @Note, @CreatedById, SYSUTCDATETIME());

    SET @TransactionId = SCOPE_IDENTITY();
    SET @Result = 0;
END
