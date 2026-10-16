-- Generic single-table JSON export used by the Backup export flow. @TableName is validated
-- against a fixed allowlist (never taken as free-form user input) before being used in dynamic
-- SQL, and QUOTENAME'd for defense in depth.
CREATE OR ALTER PROCEDURE dbo.sp_Backup_ExportTable
    @TableName SYSNAME,
    @Json NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @TableName NOT IN (
        'SubscriptionPayments','Subscriptions','SubscriptionPlans',
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

    DECLARE @Sql NVARCHAR(MAX) = N'SELECT @JsonOut = (SELECT * FROM ' + QUOTENAME(@TableName) + N' FOR JSON PATH)';
    EXEC sys.sp_executesql @Sql, N'@JsonOut NVARCHAR(MAX) OUTPUT', @JsonOut = @Json OUTPUT;
    SET @Json = COALESCE(@Json, N'[]');
END
