-- All cash/bank accounts with their derived current balance (opening + all movements).
CREATE OR ALTER PROCEDURE dbo.sp_MoneyAccount_List
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.Id, a.Name, a.Kind, a.BankName, a.AccountNumber, a.Ifsc, a.OpeningBalance, a.IsDefault, a.Status, a.CreatedAt,
        a.OpeningBalance + COALESCE(m.NetMovement, 0) AS CurrentBalance,
        COALESCE(m.TotalIn, 0) AS TotalIn,
        COALESCE(m.TotalOut, 0) AS TotalOut
    FROM dbo.MoneyAccounts a
    OUTER APPLY (
        SELECT SUM(AmountIn) AS TotalIn, SUM(AmountOut) AS TotalOut, SUM(AmountIn - AmountOut) AS NetMovement
        FROM dbo.fn_CashBank_Movements() mv
        WHERE mv.AccountId = a.Id
    ) m
    ORDER BY CASE WHEN a.Kind = 'CASH' THEN 0 ELSE 1 END, a.IsDefault DESC, a.Name;
END
