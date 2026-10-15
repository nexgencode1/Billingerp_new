-- Every cash/bank money movement, one row per account side. The single source of truth for
-- Cash & Bank balances, ledgers, the Day Book's money columns and the Balance Sheet.
-- (An inline table-valued function rather than a procedure so those SPs can all SELECT from the
-- same routing logic; the file name sorts before sp_* so SqlScriptRunner creates it first.)
-- Routing: method CASH -> the CASH account; UPI / CARD / BANK -> the default BANK account
-- (IsDefault first, else the lowest Id). CREDIT / "Store Credit" move no money and are skipped.
CREATE OR ALTER FUNCTION dbo.fn_CashBank_Movements()
RETURNS TABLE
AS
RETURN
WITH Accts AS (
    SELECT
        (SELECT TOP 1 Id FROM dbo.MoneyAccounts WHERE Kind = 'CASH' AND Status = 1 ORDER BY Id) AS CashId,
        (SELECT TOP 1 Id FROM dbo.MoneyAccounts WHERE Kind = 'BANK' AND Status = 1 ORDER BY IsDefault DESC, Id) AS BankId
)
SELECT
    CASE WHEN UPPER(p.Method) = 'CASH' THEN a.CashId ELSE a.BankId END AS AccountId,
    p.Date AS TxnDate,
    CASE WHEN p.Direction = 'RECEIVE' THEN 'PAYMENT_IN' ELSE 'PAYMENT_OUT' END AS Source,
    p.Id AS RefId,
    p.PaymentNumber AS RefNumber,
    COALESCE(c.Name, s.Name) AS PartyName,
    CONCAT(CASE WHEN p.Direction = 'RECEIVE' THEN 'Received' ELSE 'Paid' END, ' via ', p.Method,
           CASE WHEN sa.InvoiceNumber IS NOT NULL THEN CONCAT(' against ', sa.InvoiceNumber)
                WHEN pu.PurchaseNumber IS NOT NULL THEN CONCAT(' against ', pu.PurchaseNumber) ELSE '' END) AS Description,
    CASE WHEN p.Direction = 'RECEIVE' THEN p.Amount ELSE 0 END AS AmountIn,
    CASE WHEN p.Direction = 'PAY' THEN p.Amount ELSE 0 END AS AmountOut
FROM dbo.Payments p
CROSS JOIN Accts a
LEFT JOIN dbo.Customers c ON c.Id = p.CustomerId
LEFT JOIN dbo.Suppliers s ON s.Id = p.SupplierId
LEFT JOIN dbo.Sales sa ON sa.Id = p.SaleId
LEFT JOIN dbo.Purchases pu ON pu.Id = p.PurchaseId
WHERE UPPER(p.Method) IN ('CASH', 'UPI', 'CARD', 'BANK')

UNION ALL
SELECT
    CASE WHEN UPPER(e.PaymentMethod) = 'CASH' THEN a.CashId ELSE a.BankId END,
    e.Date, 'EXPENSE', e.Id, CONCAT('EXP#', e.Id), NULL,
    CONCAT(ec.Name, CASE WHEN e.Description IS NOT NULL THEN CONCAT(' - ', e.Description) ELSE '' END),
    0, e.Amount
FROM dbo.Expenses e
CROSS JOIN Accts a
JOIN dbo.ExpenseCategories ec ON ec.Id = e.CategoryId
WHERE UPPER(e.PaymentMethod) IN ('CASH', 'UPI', 'CARD', 'BANK')

UNION ALL
SELECT
    CASE WHEN UPPER(r.RefundMethod) = 'CASH' THEN a.CashId ELSE a.BankId END,
    r.ReturnDate, 'SALE_REFUND', r.Id, r.ReturnNumber, c.Name,
    CONCAT('Refund for credit note ', r.ReturnNumber), 0, r.TotalAmount
FROM dbo.SaleReturns r
CROSS JOIN Accts a
LEFT JOIN dbo.Customers c ON c.Id = r.CustomerId
WHERE UPPER(r.RefundMethod) IN ('CASH', 'UPI', 'CARD', 'BANK')

UNION ALL
SELECT t.FromAccountId, t.Date, CASE WHEN t.Type = 'TRANSFER' THEN 'TRANSFER_OUT' ELSE 'ADJUST_OUT' END,
       t.Id, CONCAT('CB#', t.Id), NULL,
       CONCAT(CASE WHEN t.Type = 'TRANSFER' THEN CONCAT('Transfer to ', ta.Name) ELSE 'Reduce balance' END,
              CASE WHEN t.Note IS NOT NULL THEN CONCAT(' - ', t.Note) ELSE '' END),
       0, t.Amount
FROM dbo.CashBankTransactions t
LEFT JOIN dbo.MoneyAccounts ta ON ta.Id = t.ToAccountId
WHERE t.FromAccountId IS NOT NULL

UNION ALL
SELECT t.ToAccountId, t.Date, CASE WHEN t.Type = 'TRANSFER' THEN 'TRANSFER_IN' ELSE 'ADJUST_IN' END,
       t.Id, CONCAT('CB#', t.Id), NULL,
       CONCAT(CASE WHEN t.Type = 'TRANSFER' THEN CONCAT('Transfer from ', fa.Name) ELSE 'Add balance' END,
              CASE WHEN t.Note IS NOT NULL THEN CONCAT(' - ', t.Note) ELSE '' END),
       t.Amount, 0
FROM dbo.CashBankTransactions t
LEFT JOIN dbo.MoneyAccounts fa ON fa.Id = t.FromAccountId
WHERE t.ToAccountId IS NOT NULL;
