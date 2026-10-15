-- Statement for one cash/bank account. 2 result sets:
-- 1) opening balance as of @From (account opening + every movement before @From) and period totals,
-- 2) movements in [@From, @To] with a running balance.
CREATE OR ALTER PROCEDURE dbo.sp_CashBank_Ledger
    @AccountId INT,
    @From DATETIME2,
    @To DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Opening DECIMAL(18,2) =
        COALESCE((SELECT OpeningBalance FROM dbo.MoneyAccounts WHERE Id = @AccountId), 0)
        + COALESCE((SELECT SUM(AmountIn - AmountOut) FROM dbo.fn_CashBank_Movements() WHERE AccountId = @AccountId AND TxnDate < @From), 0);

    SELECT
        @Opening AS OpeningBalance,
        COALESCE(SUM(AmountIn), 0) AS TotalIn,
        COALESCE(SUM(AmountOut), 0) AS TotalOut,
        @Opening + COALESCE(SUM(AmountIn - AmountOut), 0) AS ClosingBalance
    FROM dbo.fn_CashBank_Movements()
    WHERE AccountId = @AccountId AND TxnDate >= @From AND TxnDate <= @To;

    SELECT
        TxnDate, Source, RefId, RefNumber, PartyName, Description, AmountIn, AmountOut,
        @Opening + SUM(AmountIn - AmountOut) OVER (ORDER BY TxnDate, Source, RefId ROWS UNBOUNDED PRECEDING) AS RunningBalance
    FROM dbo.fn_CashBank_Movements()
    WHERE AccountId = @AccountId AND TxnDate >= @From AND TxnDate <= @To
    ORDER BY TxnDate, Source, RefId;
END
