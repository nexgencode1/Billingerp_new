-- @ItemsJson: [{"productId":1,"productName":"...","quantity":1,"rate":1,"discount":0,"gstRate":0,"taxableAmount":1,"gstAmount":0,"total":1}]
-- @PaymentsJson: [{"method":"CASH","amount":100}]
-- Totals/GST split are computed in C# (GstService, a pure port of lib/gst.ts) and passed in
-- already-computed — this procedure owns the atomic multi-table write only.
CREATE OR ALTER PROCEDURE dbo.sp_Sale_Create
    @InvoiceDate DATETIME2,
    @CustomerId INT = NULL,
    @Subtotal DECIMAL(18,2),
    @Discount DECIMAL(18,2),
    @TaxableAmount DECIMAL(18,2),
    @Cgst DECIMAL(18,2),
    @Sgst DECIMAL(18,2),
    @Igst DECIMAL(18,2),
    @GrandTotal DECIMAL(18,2),
    @PaidAmount DECIMAL(18,2),
    @DueAmount DECIMAL(18,2),
    @PaymentStatus NVARCHAR(20),
    @PaymentMethod NVARCHAR(20),
    @ItemsJson NVARCHAR(MAX),
    @PaymentsJson NVARCHAR(MAX),
    @CreatedById INT,
    @SourceDocumentId INT = NULL, -- Estimate / Sale Order / Challan being converted (optional)
    @SaleId INT OUTPUT,
    @InvoiceNumber NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

    EXEC dbo.sp_Numbering_GetNext @Kind = 'SALE', @Number = @InvoiceNumber OUTPUT;

    INSERT INTO dbo.Sales
        (InvoiceNumber, InvoiceDate, CustomerId, Subtotal, Discount, TaxableAmount, Cgst, Sgst, Igst,
         GrandTotal, PaidAmount, DueAmount, PaymentStatus, PaymentMethod, Status, CreatedById, CreatedAt)
    VALUES
        (@InvoiceNumber, @InvoiceDate, @CustomerId, @Subtotal, @Discount, @TaxableAmount, @Cgst, @Sgst, @Igst,
         @GrandTotal, @PaidAmount, @DueAmount, @PaymentStatus, @PaymentMethod, 'CONFIRMED', @CreatedById, SYSUTCDATETIME());

    SET @SaleId = SCOPE_IDENTITY();

    IF @SourceDocumentId IS NOT NULL
    BEGIN
        UPDATE dbo.SalesDocuments
        SET Status = 'CONVERTED', ConvertedSaleId = @SaleId
        WHERE Id = @SourceDocumentId AND Status = 'OPEN';
        IF @@ROWCOUNT = 0
            THROW 51003, 'This document is no longer open (already converted or cancelled).', 1;
    END

    INSERT INTO dbo.SaleItems (SaleId, ProductId, ProductName, Quantity, Rate, Discount, GstRate, TaxableAmount, GstAmount, Total)
    SELECT @SaleId, ProductId, ProductName, Quantity, Rate, Discount, GstRate, TaxableAmount, GstAmount, Total
    FROM OPENJSON(@ItemsJson) WITH (
        ProductId INT '$.productId',
        ProductName NVARCHAR(200) '$.productName',
        Quantity DECIMAL(18,2) '$.quantity',
        Rate DECIMAL(18,2) '$.rate',
        Discount DECIMAL(18,2) '$.discount',
        GstRate DECIMAL(18,2) '$.gstRate',
        TaxableAmount DECIMAL(18,2) '$.taxableAmount',
        GstAmount DECIMAL(18,2) '$.gstAmount',
        Total DECIMAL(18,2) '$.total'
    );

    DECLARE @Items TABLE (RowNum INT IDENTITY(1,1), ProductId INT, Quantity DECIMAL(18,2));
    INSERT INTO @Items (ProductId, Quantity)
    SELECT ProductId, Quantity FROM OPENJSON(@ItemsJson) WITH (ProductId INT '$.productId', Quantity DECIMAL(18,2) '$.quantity');

    DECLARE @i INT = 1, @ItemCount INT = (SELECT COUNT(*) FROM @Items);
    DECLARE @PId INT, @PQty DECIMAL(18,2), @NB DECIMAL(18,2), @TxnId INT, @Note NVARCHAR(300) = CONCAT('Sale ', @InvoiceNumber);
    WHILE @i <= @ItemCount
    BEGIN
        SELECT @PId = ProductId, @PQty = Quantity FROM @Items WHERE RowNum = @i;
        EXEC dbo.sp_Stock_RecordTransaction
            @ProductId = @PId, @Type = 'SALE', @QuantityOut = @PQty,
            @ReferenceType = 'SALE', @ReferenceId = @SaleId, @Note = @Note, @CreatedById = @CreatedById,
            @NewBalance = @NB OUTPUT, @TransactionId = @TxnId OUTPUT;
        SET @i += 1;
    END

    DECLARE @Payments TABLE (RowNum INT IDENTITY(1,1), Method NVARCHAR(20), Amount DECIMAL(18,2));
    INSERT INTO @Payments (Method, Amount)
    SELECT Method, Amount FROM OPENJSON(@PaymentsJson) WITH (Method NVARCHAR(20) '$.method', Amount DECIMAL(18,2) '$.amount');

    DECLARE @j INT = 1, @PayCount INT = (SELECT COUNT(*) FROM @Payments);
    DECLARE @PayMethod NVARCHAR(20), @PayAmount DECIMAL(18,2), @PayNumber NVARCHAR(50);
    WHILE @j <= @PayCount
    BEGIN
        SELECT @PayMethod = Method, @PayAmount = Amount FROM @Payments WHERE RowNum = @j;
        EXEC dbo.sp_Numbering_GetNext @Kind = 'PAYMENT', @Number = @PayNumber OUTPUT;
        INSERT INTO dbo.Payments (PaymentNumber, Direction, Date, Amount, Method, CustomerId, SaleId, CreatedById, CreatedAt)
        VALUES (@PayNumber, 'RECEIVE', @InvoiceDate, @PayAmount, @PayMethod, @CustomerId, @SaleId, @CreatedById, SYSUTCDATETIME());
        SET @j += 1;
    END

    COMMIT TRAN;
END
