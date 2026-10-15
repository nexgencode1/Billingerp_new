-- Create (@RecurringId NULL) or update a recurring invoice template and replace its items.
-- @Result: 0 = ok, 1 = not found, 2 = customer not found.
CREATE OR ALTER PROCEDURE dbo.sp_Recurring_Save
    @RecurringId INT = NULL,
    @Name NVARCHAR(200),
    @CustomerId INT,
    @Frequency NVARCHAR(20),
    @StartDate DATETIME2,
    @EndDate DATETIME2 = NULL,
    @NextRunDate DATETIME2,
    @IsActive BIT = 1,
    @Notes NVARCHAR(MAX) = NULL,
    @ItemsJson NVARCHAR(MAX),
    @CreatedById INT,
    @SavedId INT OUTPUT,
    @Result INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE Id = @CustomerId)
    BEGIN
        SET @Result = 2;
        RETURN;
    END

    BEGIN TRAN;

    IF @RecurringId IS NULL
    BEGIN
        INSERT INTO dbo.RecurringInvoices
            (Name, CustomerId, Frequency, StartDate, EndDate, NextRunDate, IsActive, RunCount, Notes, CreatedById, CreatedAt)
        VALUES (@Name, @CustomerId, @Frequency, @StartDate, @EndDate, @NextRunDate, @IsActive, 0, @Notes, @CreatedById, SYSUTCDATETIME());
        SET @SavedId = SCOPE_IDENTITY();
    END
    ELSE
    BEGIN
        UPDATE dbo.RecurringInvoices
        SET Name = @Name, CustomerId = @CustomerId, Frequency = @Frequency, StartDate = @StartDate, EndDate = @EndDate,
            NextRunDate = @NextRunDate, IsActive = @IsActive, Notes = @Notes,
            LastError = CASE WHEN @IsActive = 1 THEN NULL ELSE LastError END
        WHERE Id = @RecurringId;
        IF @@ROWCOUNT = 0
        BEGIN
            ROLLBACK TRAN;
            SET @Result = 1;
            RETURN;
        END
        SET @SavedId = @RecurringId;
        DELETE FROM dbo.RecurringInvoiceItems WHERE RecurringInvoiceId = @SavedId;
    END

    INSERT INTO dbo.RecurringInvoiceItems (RecurringInvoiceId, ProductId, ProductName, Quantity, Rate, Discount, GstRate)
    SELECT @SavedId, ProductId, ProductName, Quantity, Rate, COALESCE(Discount, 0), COALESCE(GstRate, 0)
    FROM OPENJSON(@ItemsJson) WITH (
        ProductId INT '$.productId',
        ProductName NVARCHAR(200) '$.productName',
        Quantity DECIMAL(18,2) '$.quantity',
        Rate DECIMAL(18,2) '$.rate',
        Discount DECIMAL(18,2) '$.discount',
        GstRate DECIMAL(18,2) '$.gstRate'
    );

    COMMIT TRAN;
    SET @Result = 0;
END
