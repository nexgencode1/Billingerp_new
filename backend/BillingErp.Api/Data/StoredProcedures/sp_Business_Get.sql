CREATE OR ALTER PROCEDURE dbo.sp_Business_Get
AS
BEGIN
    SET NOCOUNT ON;
    -- Explicit column list (not *): BusinessController maps this onto a positional record.
    SELECT TOP 1
        Id, Name, Logo, Address, Phone, Email, Website, Gstin, Pan, State, Pincode, BankName, AccountNumber, Ifsc, UpiId, InvoicePrefix, PurchasePrefix, PaymentPrefix, ExpensePrefix, SaleReturnPrefix, PurchaseReturnPrefix, ProductionPrefix, SaleCounter, PurchaseCounter, PaymentCounter, ExpenseCounter, SaleReturnCounter, PurchaseReturnCounter, ProductionCounter, DateFormat, Currency, DecimalPlaces, ShowLogo, ShowGst, ShowHsn, ShowSignature, ShowTerms, TermsText, CreatedAt, UpdatedAt, EstimatePrefix, SaleOrderPrefix, ChallanPrefix, EstimateCounter, SaleOrderCounter, ChallanCounter
    FROM dbo.Businesses;
END
