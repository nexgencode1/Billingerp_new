-- Everything a logged-in customer may see about THEMSELVES (scoped by @CustomerId only).
-- 1) profile  2) totals  3) invoices  4) payments received from them  5) credit notes
CREATE OR ALTER PROCEDURE dbo.sp_Portal_Summary
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id, Name, Mobile, Email, Address, City, State, Pincode, Gstin, OpeningBalance
    FROM dbo.Customers WHERE Id = @CustomerId;

    SELECT
        COALESCE(SUM(CASE WHEN Status = 'CONFIRMED' THEN GrandTotal END), 0) AS TotalBilled,
        COALESCE(SUM(CASE WHEN Status = 'CONFIRMED' THEN PaidAmount END), 0) AS TotalPaid,
        COALESCE(SUM(CASE WHEN Status = 'CONFIRMED' THEN DueAmount END), 0) AS TotalDue,
        COUNT(CASE WHEN Status = 'CONFIRMED' AND DueAmount > 0 THEN 1 END) AS OpenInvoices
    FROM dbo.Sales WHERE CustomerId = @CustomerId;

    SELECT Id, InvoiceNumber, InvoiceDate, GrandTotal, PaidAmount, DueAmount, PaymentStatus, Status
    FROM dbo.Sales WHERE CustomerId = @CustomerId
    ORDER BY InvoiceDate DESC, Id DESC;

    SELECT p.Id, p.PaymentNumber, p.Date, p.Amount, p.Method, s.InvoiceNumber
    FROM dbo.Payments p
    LEFT JOIN dbo.Sales s ON s.Id = p.SaleId
    WHERE p.CustomerId = @CustomerId AND p.Direction = 'RECEIVE'
    ORDER BY p.Date DESC, p.Id DESC;

    SELECT r.ReturnNumber, r.ReturnDate, r.TotalAmount, s.InvoiceNumber, r.RefundMethod
    FROM dbo.SaleReturns r
    JOIN dbo.Sales s ON s.Id = r.SaleId
    WHERE r.CustomerId = @CustomerId
    ORDER BY r.ReturnDate DESC;
END
