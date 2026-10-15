-- Simplified balance sheet as of today (one row of figures; the C# side lays out the statement).
-- Assets: cash + bank balances (opening + movements), receivables (open sale dues + customer
-- opening balances), closing stock at current purchase price.
-- Liabilities: payables (open purchase dues + supplier opening balances), net GST collected
-- (output − input), which this app does not net against GST actually paid to the government.
-- Net profit to date uses the same basis as sp_Report_Profit (taxable sales − COGS − expenses).
-- Owner's capital is the balancing figure (assets − liabilities − net profit).
CREATE OR ALTER PROCEDURE dbo.sp_Report_BalanceSheet
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Cash DECIMAL(18,2), @Bank DECIMAL(18,2), @Receivables DECIMAL(18,2), @CustomerOpening DECIMAL(18,2),
            @StockValue DECIMAL(18,2), @Payables DECIMAL(18,2), @SupplierOpening DECIMAL(18,2),
            @OutputGst DECIMAL(18,2), @InputGst DECIMAL(18,2), @NetProfit DECIMAL(18,2);

    SELECT
        @Cash = COALESCE(SUM(CASE WHEN a.Kind = 'CASH' THEN a.OpeningBalance + COALESCE(m.Net, 0) END), 0),
        @Bank = COALESCE(SUM(CASE WHEN a.Kind = 'BANK' THEN a.OpeningBalance + COALESCE(m.Net, 0) END), 0)
    FROM dbo.MoneyAccounts a
    OUTER APPLY (SELECT SUM(AmountIn - AmountOut) AS Net FROM dbo.fn_CashBank_Movements() mv WHERE mv.AccountId = a.Id) m;

    SELECT @Receivables = COALESCE(SUM(DueAmount), 0) FROM dbo.Sales WHERE Status = 'CONFIRMED';
    SELECT @CustomerOpening = COALESCE(SUM(OpeningBalance), 0) FROM dbo.Customers;

    SELECT @StockValue = COALESCE(SUM(st.Balance * p.PurchasePrice), 0)
    FROM dbo.Products p
    CROSS APPLY (SELECT COALESCE(SUM(t.QuantityIn) - SUM(t.QuantityOut), 0) AS Balance FROM dbo.StockTransactions t WHERE t.ProductId = p.Id) st
    WHERE st.Balance > 0;

    SELECT @Payables = COALESCE(SUM(DueAmount), 0) FROM dbo.Purchases WHERE Status = 'CONFIRMED';
    SELECT @SupplierOpening = COALESCE(SUM(OpeningBalance), 0) FROM dbo.Suppliers;

    SELECT @OutputGst = COALESCE(SUM(Cgst + Sgst + Igst), 0) FROM dbo.Sales WHERE Status = 'CONFIRMED';
    SELECT @InputGst = COALESCE(SUM(Cgst + Sgst + Igst), 0) FROM dbo.Purchases WHERE Status = 'CONFIRMED';

    SELECT @NetProfit =
        COALESCE((SELECT SUM(TaxableAmount) FROM dbo.Sales WHERE Status = 'CONFIRMED'), 0)
        - COALESCE((SELECT SUM(si.Quantity * p.PurchasePrice) FROM dbo.Sales s JOIN dbo.SaleItems si ON si.SaleId = s.Id
                    JOIN dbo.Products p ON p.Id = si.ProductId WHERE s.Status = 'CONFIRMED'), 0)
        - COALESCE((SELECT SUM(Amount) FROM dbo.Expenses), 0);

    SELECT @Cash AS Cash, @Bank AS Bank, @Receivables AS Receivables, @CustomerOpening AS CustomerOpening,
           @StockValue AS StockValue, @Payables AS Payables, @SupplierOpening AS SupplierOpening,
           @OutputGst AS OutputGst, @InputGst AS InputGst, @NetProfit AS NetProfit;

    -- Per-account breakdown for the Cash & Bank section.
    SELECT a.Name, a.Kind, a.OpeningBalance + COALESCE(m.Net, 0) AS Balance
    FROM dbo.MoneyAccounts a
    OUTER APPLY (SELECT SUM(AmountIn - AmountOut) AS Net FROM dbo.fn_CashBank_Movements() mv WHERE mv.AccountId = a.Id) m
    ORDER BY CASE WHEN a.Kind = 'CASH' THEN 0 ELSE 1 END, a.Name;
END
