-- Creates an Estimate / Sale Order / Delivery Challan. Totals arrive pre-computed by
-- GstService (same as sp_Sale_Create). No stock, payment or due side effects — by design.
CREATE OR ALTER PROCEDURE dbo.sp_SalesDocument_Create
    @DocType NVARCHAR(30),
    @DocDate DATETIME2,
    @DueDate DATETIME2 = NULL,
    @CustomerId INT = NULL,
    @Subtotal DECIMAL(18,2),
    @Discount DECIMAL(18,2),
    @TaxableAmount DECIMAL(18,2),
    @Cgst DECIMAL(18,2),
    @Sgst DECIMAL(18,2),
    @Igst DECIMAL(18,2),
    @GrandTotal DECIMAL(18,2),
    @Notes NVARCHAR(MAX) = NULL,
    @ItemsJson NVARCHAR(MAX),
    @CreatedById INT,
    @DocumentId INT OUTPUT,
    @DocNumber NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @DocType NOT IN ('ESTIMATE', 'SALE_ORDER', 'DELIVERY_CHALLAN')
    BEGIN
        THROW 51002, 'Unknown document type.', 1;
        RETURN;
    END

    BEGIN TRAN;

    EXEC dbo.sp_Numbering_GetNext @Kind = @DocType, @Number = @DocNumber OUTPUT;

    INSERT INTO dbo.SalesDocuments
        (DocType, DocNumber, DocDate, DueDate, CustomerId, Subtotal, Discount, TaxableAmount, Cgst, Sgst, Igst,
         GrandTotal, Status, Notes, CreatedById, CreatedAt)
    VALUES
        (@DocType, @DocNumber, @DocDate, @DueDate, @CustomerId, @Subtotal, @Discount, @TaxableAmount, @Cgst, @Sgst, @Igst,
         @GrandTotal, 'OPEN', @Notes, @CreatedById, SYSUTCDATETIME());

    SET @DocumentId = SCOPE_IDENTITY();

    INSERT INTO dbo.SalesDocumentItems
        (SalesDocumentId, ProductId, ProductName, Quantity, Rate, Discount, GstRate, TaxableAmount, GstAmount, Total)
    SELECT @DocumentId, ProductId, ProductName, Quantity, Rate, Discount, GstRate, TaxableAmount, GstAmount, Total
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

    COMMIT TRAN;
END
