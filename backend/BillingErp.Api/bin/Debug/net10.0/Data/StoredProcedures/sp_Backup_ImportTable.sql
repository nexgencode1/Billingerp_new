-- Generic single-table JSON restore. Column list + OPENJSON WITH clause are built from the
-- table's actual sys.columns metadata (never from the JSON payload), so this stays safe even
-- though it uses dynamic SQL. IDs are preserved verbatim (IDENTITY_INSERT toggled automatically
-- when the table has an identity column).
CREATE OR ALTER PROCEDURE dbo.sp_Backup_ImportTable
    @TableName SYSNAME,
    @RowsJson NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @TableName NOT IN (
        'AuditLogs','Notifications','CashBankTransactions','MoneyAccounts','SalesDocumentItems','SalesDocuments',
        'CustomerPortalAccounts','PaymentReminders','RecurringInvoiceItems','RecurringInvoices','HsnCodes',
        'ProductionConsumptions','ProductionOrders','BOMItems','Payrolls',
        'Attendances','Employees','LeadActivities','Leads','Expenses','ExpenseCategories','StockAdjustments',
        'StockTransactions','Payments','PurchaseReturnItems','PurchaseReturns','PurchaseItems','Purchases',
        'SaleReturnItems','SaleReturns','SaleItems','Sales','Suppliers','Customers','Products','Units',
        'Brands','Categories','Businesses','Users','RolePermissions','Permissions','Roles'
    )
    BEGIN
        THROW 51000, 'Unknown table name.', 1;
        RETURN;
    END

    IF @RowsJson IS NULL OR @RowsJson = N'[]' OR @RowsJson = N''
        RETURN;

    DECLARE @HasIdentity BIT = CASE WHEN OBJECTPROPERTY(OBJECT_ID(QUOTENAME(@TableName)), 'TableHasIdentity') = 1 THEN 1 ELSE 0 END;

    DECLARE @ColumnList NVARCHAR(MAX), @WithClause NVARCHAR(MAX);

    SELECT
        @ColumnList = STRING_AGG(QUOTENAME(c.name), N',') WITHIN GROUP (ORDER BY c.column_id),
        @WithClause = STRING_AGG(
            QUOTENAME(c.name) + N' ' + tp.name +
            CASE
                WHEN tp.name IN ('nvarchar','varchar','nchar','char') THEN N'(MAX)'
                WHEN tp.name IN ('decimal','numeric') THEN N'(' + CAST(c.precision AS NVARCHAR(10)) + N',' + CAST(c.scale AS NVARCHAR(10)) + N')'
                ELSE N''
            END
            + N' ''$.' + c.name + N'''',
            N',') WITHIN GROUP (ORDER BY c.column_id)
    FROM sys.columns c
    JOIN sys.types tp ON tp.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(QUOTENAME(@TableName));

    DECLARE @Sql NVARCHAR(MAX) =
        (CASE WHEN @HasIdentity = 1 THEN N'SET IDENTITY_INSERT ' + QUOTENAME(@TableName) + N' ON; ' ELSE N'' END) +
        N'INSERT INTO ' + QUOTENAME(@TableName) + N' (' + @ColumnList + N') ' +
        N'SELECT ' + @ColumnList + N' FROM OPENJSON(@Rows) WITH (' + @WithClause + N'); ' +
        (CASE WHEN @HasIdentity = 1 THEN N'SET IDENTITY_INSERT ' + QUOTENAME(@TableName) + N' OFF;' ELSE N'' END);

    EXEC sys.sp_executesql @Sql, N'@Rows NVARCHAR(MAX)', @Rows = @RowsJson;
END
