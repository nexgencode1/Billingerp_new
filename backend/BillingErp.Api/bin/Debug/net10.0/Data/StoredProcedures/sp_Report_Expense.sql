-- 3 result sets: 1) totalExpenses, 2) byCategory (category,amount), 3) full expense rows.
-- Optional filters (@CategoryId, @PaymentMethod) apply to all result sets; NULL = no filter.
CREATE OR ALTER PROCEDURE dbo.sp_Report_Expense
    @From DATETIME2,
    @To DATETIME2,
    @CategoryId INT = NULL,
    @PaymentMethod NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT COALESCE(SUM(Amount), 0) AS TotalExpenses
    FROM dbo.Expenses
    WHERE Date >= @From AND Date <= @To
      AND (@CategoryId IS NULL OR CategoryId = @CategoryId)
      AND (@PaymentMethod IS NULL OR PaymentMethod = @PaymentMethod);

    SELECT c.Name AS Category, SUM(e.Amount) AS Amount
    FROM dbo.Expenses e
    JOIN dbo.ExpenseCategories c ON c.Id = e.CategoryId
    WHERE e.Date >= @From AND e.Date <= @To
      AND (@CategoryId IS NULL OR e.CategoryId = @CategoryId)
      AND (@PaymentMethod IS NULL OR e.PaymentMethod = @PaymentMethod)
    GROUP BY c.Name
    ORDER BY SUM(e.Amount) DESC;

    SELECT
        e.Id, e.CategoryId, c.Name AS CategoryName, e.Amount, e.Date, e.PaymentMethod,
        e.Description, e.Attachment, e.CreatedById, e.CreatedAt
    FROM dbo.Expenses e
    JOIN dbo.ExpenseCategories c ON c.Id = e.CategoryId
    WHERE e.Date >= @From AND e.Date <= @To
      AND (@CategoryId IS NULL OR e.CategoryId = @CategoryId)
      AND (@PaymentMethod IS NULL OR e.PaymentMethod = @PaymentMethod)
    ORDER BY e.Date ASC;
END
