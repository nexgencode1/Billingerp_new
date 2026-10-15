-- Create (@AccountId NULL) or update a cash/bank account. Making an account the default bank
-- clears the flag on every other account, so exactly one BANK account receives UPI/CARD/BANK.
-- @Result: 0 = ok, 1 = not found, 2 = a second CASH account is not allowed.
CREATE OR ALTER PROCEDURE dbo.sp_MoneyAccount_Save
    @AccountId INT = NULL,
    @Name NVARCHAR(200),
    @Kind NVARCHAR(10),
    @BankName NVARCHAR(200) = NULL,
    @AccountNumber NVARCHAR(50) = NULL,
    @Ifsc NVARCHAR(20) = NULL,
    @OpeningBalance DECIMAL(18,2) = 0,
    @IsDefault BIT = 0,
    @Status BIT = 1,
    @SavedId INT OUTPUT,
    @Result INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    IF @AccountId IS NULL
    BEGIN
        IF @Kind = 'CASH' AND EXISTS (SELECT 1 FROM dbo.MoneyAccounts WITH (UPDLOCK, HOLDLOCK) WHERE Kind = 'CASH')
        BEGIN
            SET @Result = 2;
            ROLLBACK TRAN;
            RETURN;
        END

        INSERT INTO dbo.MoneyAccounts (Name, Kind, BankName, AccountNumber, Ifsc, OpeningBalance, IsDefault, Status, CreatedAt)
        VALUES (@Name, @Kind, @BankName, @AccountNumber, @Ifsc, @OpeningBalance,
                CASE WHEN @Kind = 'BANK' THEN @IsDefault ELSE 0 END, @Status, SYSUTCDATETIME());
        SET @SavedId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        DECLARE @ExistingKind NVARCHAR(10);
        SELECT @ExistingKind = Kind FROM dbo.MoneyAccounts WITH (UPDLOCK) WHERE Id = @AccountId;
        IF @ExistingKind IS NULL
        BEGIN
            SET @Result = 1;
            ROLLBACK TRAN;
            RETURN;
        END

        -- Kind can't change after creation (it decides which payments route here).
        UPDATE dbo.MoneyAccounts
        SET Name = @Name, BankName = @BankName, AccountNumber = @AccountNumber, Ifsc = @Ifsc,
            OpeningBalance = @OpeningBalance,
            IsDefault = CASE WHEN @ExistingKind = 'BANK' THEN @IsDefault ELSE 0 END,
            Status = CASE WHEN @ExistingKind = 'CASH' THEN 1 ELSE @Status END
        WHERE Id = @AccountId;
        SET @SavedId = @AccountId;
    END

    IF @IsDefault = 1 AND EXISTS (SELECT 1 FROM dbo.MoneyAccounts WHERE Id = @SavedId AND Kind = 'BANK')
        UPDATE dbo.MoneyAccounts SET IsDefault = 0 WHERE Id <> @SavedId AND IsDefault = 1;

    COMMIT TRAN;
    SET @Result = 0;
END
