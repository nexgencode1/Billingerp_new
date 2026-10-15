CREATE OR ALTER PROCEDURE dbo.sp_Backup_ClearTable
    @TableName SYSNAME
AS
BEGIN
    SET NOCOUNT ON;

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

    DECLARE @Sql NVARCHAR(MAX) = N'DELETE FROM ' + QUOTENAME(@TableName);
    EXEC sys.sp_executesql @Sql;
END
