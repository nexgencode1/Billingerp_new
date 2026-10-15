CREATE OR ALTER PROCEDURE dbo.sp_Numbering_GetNext
    @Kind NVARCHAR(30),
    @Number NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    DECLARE @BusinessId INT, @NextCount INT, @Prefix NVARCHAR(20);

    SELECT TOP 1 @BusinessId = Id FROM dbo.Businesses WITH (UPDLOCK, HOLDLOCK);
    IF @BusinessId IS NULL
    BEGIN
        ROLLBACK TRAN;
        THROW 51000, 'Business profile is not set up yet.', 1;
        RETURN;
    END

    IF @Kind = 'SALE'
    BEGIN
        UPDATE dbo.Businesses SET SaleCounter = SaleCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = SaleCounter, @Prefix = InvoicePrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'PURCHASE'
    BEGIN
        UPDATE dbo.Businesses SET PurchaseCounter = PurchaseCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = PurchaseCounter, @Prefix = PurchasePrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'PAYMENT'
    BEGIN
        UPDATE dbo.Businesses SET PaymentCounter = PaymentCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = PaymentCounter, @Prefix = PaymentPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'EXPENSE'
    BEGIN
        UPDATE dbo.Businesses SET ExpenseCounter = ExpenseCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = ExpenseCounter, @Prefix = ExpensePrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'SALE_RETURN'
    BEGIN
        UPDATE dbo.Businesses SET SaleReturnCounter = SaleReturnCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = SaleReturnCounter, @Prefix = SaleReturnPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'PURCHASE_RETURN'
    BEGIN
        UPDATE dbo.Businesses SET PurchaseReturnCounter = PurchaseReturnCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = PurchaseReturnCounter, @Prefix = PurchaseReturnPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'PRODUCTION'
    BEGIN
        UPDATE dbo.Businesses SET ProductionCounter = ProductionCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = ProductionCounter, @Prefix = ProductionPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'ESTIMATE'
    BEGIN
        UPDATE dbo.Businesses SET EstimateCounter = EstimateCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = EstimateCounter, @Prefix = EstimatePrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'SALE_ORDER'
    BEGIN
        UPDATE dbo.Businesses SET SaleOrderCounter = SaleOrderCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = SaleOrderCounter, @Prefix = SaleOrderPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE IF @Kind = 'DELIVERY_CHALLAN'
    BEGIN
        UPDATE dbo.Businesses SET ChallanCounter = ChallanCounter + 1 WHERE Id = @BusinessId;
        SELECT @NextCount = ChallanCounter, @Prefix = ChallanPrefix FROM dbo.Businesses WHERE Id = @BusinessId;
    END
    ELSE
    BEGIN
        ROLLBACK TRAN;
        THROW 51001, 'Unknown number series kind.', 1;
        RETURN;
    END

    COMMIT TRAN;

    SET @Number = @Prefix + '-' + RIGHT('00000' + CAST(@NextCount AS VARCHAR(10)), 5);
END
