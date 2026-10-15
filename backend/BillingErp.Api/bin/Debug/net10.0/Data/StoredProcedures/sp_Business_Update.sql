-- Upsert: creates the single Business row (name defaults to "My Business") if none exists yet,
-- otherwise updates the existing row. Booleans use the @XxxProvided trick (false must be
-- distinguishable from "not sent"); everything else uses COALESCE.
CREATE OR ALTER PROCEDURE dbo.sp_Business_Update
    @Name NVARCHAR(200) = NULL,
    @Logo NVARCHAR(500) = NULL,
    @Address NVARCHAR(500) = NULL,
    @Phone NVARCHAR(50) = NULL,
    @Email NVARCHAR(200) = NULL,
    @Website NVARCHAR(200) = NULL,
    @Gstin NVARCHAR(20) = NULL,
    @Pan NVARCHAR(20) = NULL,
    @State NVARCHAR(100) = NULL,
    @Pincode NVARCHAR(20) = NULL,
    @BankName NVARCHAR(200) = NULL,
    @AccountNumber NVARCHAR(50) = NULL,
    @Ifsc NVARCHAR(20) = NULL,
    @UpiId NVARCHAR(100) = NULL,
    @InvoicePrefix NVARCHAR(20) = NULL,
    @PurchasePrefix NVARCHAR(20) = NULL,
    @PaymentPrefix NVARCHAR(20) = NULL,
    @ExpensePrefix NVARCHAR(20) = NULL,
    @SaleReturnPrefix NVARCHAR(20) = NULL,
    @PurchaseReturnPrefix NVARCHAR(20) = NULL,
    @EstimatePrefix NVARCHAR(20) = NULL,
    @SaleOrderPrefix NVARCHAR(20) = NULL,
    @ChallanPrefix NVARCHAR(20) = NULL,
    @DateFormat NVARCHAR(30) = NULL,
    @Currency NVARCHAR(10) = NULL,
    @DecimalPlaces INT = NULL,
    @ShowLogoProvided BIT = 0, @ShowLogo BIT = 0,
    @ShowGstProvided BIT = 0, @ShowGst BIT = 0,
    @ShowHsnProvided BIT = 0, @ShowHsn BIT = 0,
    @ShowSignatureProvided BIT = 0, @ShowSignature BIT = 0,
    @ShowTermsProvided BIT = 0, @ShowTerms BIT = 0,
    @TermsTextProvided BIT = 0, @TermsText NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id INT;
    SELECT TOP 1 @Id = Id FROM dbo.Businesses;

    IF @Id IS NULL
    BEGIN
        INSERT INTO dbo.Businesses (Name, CreatedAt, UpdatedAt) VALUES (COALESCE(@Name, 'My Business'), SYSUTCDATETIME(), SYSUTCDATETIME());
        SET @Id = SCOPE_IDENTITY();
    END

    UPDATE dbo.Businesses
    SET Name = COALESCE(@Name, Name),
        Logo = COALESCE(@Logo, Logo),
        Address = COALESCE(@Address, Address),
        Phone = COALESCE(@Phone, Phone),
        Email = COALESCE(@Email, Email),
        Website = COALESCE(@Website, Website),
        Gstin = COALESCE(@Gstin, Gstin),
        Pan = COALESCE(@Pan, Pan),
        State = COALESCE(@State, State),
        Pincode = COALESCE(@Pincode, Pincode),
        BankName = COALESCE(@BankName, BankName),
        AccountNumber = COALESCE(@AccountNumber, AccountNumber),
        Ifsc = COALESCE(@Ifsc, Ifsc),
        UpiId = COALESCE(@UpiId, UpiId),
        InvoicePrefix = COALESCE(@InvoicePrefix, InvoicePrefix),
        PurchasePrefix = COALESCE(@PurchasePrefix, PurchasePrefix),
        PaymentPrefix = COALESCE(@PaymentPrefix, PaymentPrefix),
        ExpensePrefix = COALESCE(@ExpensePrefix, ExpensePrefix),
        SaleReturnPrefix = COALESCE(@SaleReturnPrefix, SaleReturnPrefix),
        PurchaseReturnPrefix = COALESCE(@PurchaseReturnPrefix, PurchaseReturnPrefix),
        EstimatePrefix = COALESCE(@EstimatePrefix, EstimatePrefix),
        SaleOrderPrefix = COALESCE(@SaleOrderPrefix, SaleOrderPrefix),
        ChallanPrefix = COALESCE(@ChallanPrefix, ChallanPrefix),
        DateFormat = COALESCE(@DateFormat, DateFormat),
        Currency = COALESCE(@Currency, Currency),
        DecimalPlaces = COALESCE(@DecimalPlaces, DecimalPlaces),
        ShowLogo = CASE WHEN @ShowLogoProvided = 1 THEN @ShowLogo ELSE ShowLogo END,
        ShowGst = CASE WHEN @ShowGstProvided = 1 THEN @ShowGst ELSE ShowGst END,
        ShowHsn = CASE WHEN @ShowHsnProvided = 1 THEN @ShowHsn ELSE ShowHsn END,
        ShowSignature = CASE WHEN @ShowSignatureProvided = 1 THEN @ShowSignature ELSE ShowSignature END,
        ShowTerms = CASE WHEN @ShowTermsProvided = 1 THEN @ShowTerms ELSE ShowTerms END,
        TermsText = CASE WHEN @TermsTextProvided = 1 THEN @TermsText ELSE TermsText END,
        UpdatedAt = SYSUTCDATETIME()
    WHERE Id = @Id;

    -- Explicit column list (not *): BusinessController maps this onto a positional record.
    SELECT TOP 1
        Id, Name, Logo, Address, Phone, Email, Website, Gstin, Pan, State, Pincode, BankName, AccountNumber, Ifsc, UpiId, InvoicePrefix, PurchasePrefix, PaymentPrefix, ExpensePrefix, SaleReturnPrefix, PurchaseReturnPrefix, ProductionPrefix, SaleCounter, PurchaseCounter, PaymentCounter, ExpenseCounter, SaleReturnCounter, PurchaseReturnCounter, ProductionCounter, DateFormat, Currency, DecimalPlaces, ShowLogo, ShowGst, ShowHsn, ShowSignature, ShowTerms, TermsText, CreatedAt, UpdatedAt, EstimatePrefix, SaleOrderPrefix, ChallanPrefix, EstimateCounter, SaleOrderCounter, ChallanCounter
    FROM dbo.Businesses WHERE Id = @Id;
END
