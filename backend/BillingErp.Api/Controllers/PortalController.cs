using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record PortalLoginRequest(string? Mobile, string? Password);

// Customer self-service portal. Every data endpoint is scoped to the customer id inside the
// portal token — a customer can never request another customer's records.
[ApiController]
[RequirePlanFeature("PORTAL")]
[Route("api/portal")]
public class PortalController(SqlConnectionFactory connectionFactory, PortalTokenService tokens, IWebHostEnvironment env, AuditService audit) : ControllerBase
{
    private const int MaxFailures = 5;
    private const int LockMinutes = 15;
    private static readonly string DummyHash = PasswordHasher.Hash(Guid.NewGuid().ToString());

    private record AccountRow(int CustomerId, string Name, string PasswordHash, bool IsEnabled, int FailedAttempts, DateTime? LockedUntil);

    private class BusinessInfo
    {
        public string Name { get; set; } = "";
        public string? Address { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Gstin { get; set; }
        public string? State { get; set; }
        public string? UpiId { get; set; }
        public string? TermsText { get; set; }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] PortalLoginRequest? body)
    {
        const string generic = "Mobile number or password is incorrect";
        if (string.IsNullOrWhiteSpace(body?.Mobile) || string.IsNullOrWhiteSpace(body.Password))
            return BadRequest(new { error = "Enter your mobile number and password" });

        using var connection = connectionFactory.Create();
        var matches = (await connection.QueryAsync<AccountRow>("dbo.sp_Portal_FindByMobile", new { Mobile = body.Mobile }, commandType: CommandType.StoredProcedure)).ToList();
        if (matches.Count > 1) return Unauthorized(new { error = "This number is linked to more than one account — please contact the business." });

        var account = matches.FirstOrDefault();
        if (account is null || !account.IsEnabled)
        {
            // Spend roughly the same time as a real check so response timing doesn't reveal which numbers exist.
            PasswordHasher.Verify(body.Password, DummyHash);
            return Unauthorized(new { error = generic });
        }
        if (account.LockedUntil is not null && account.LockedUntil > DateTime.UtcNow)
            return StatusCode(429, new { error = $"Too many wrong attempts. Try again after {LockMinutes} minutes." });

        var ok = PasswordHasher.Verify(body.Password, account.PasswordHash);
        await connection.ExecuteAsync("dbo.sp_Portal_RecordAttempt",
            new { CustomerId = account.CustomerId, Success = ok, MaxFailures, LockMinutes }, commandType: CommandType.StoredProcedure);
        if (!ok) return Unauthorized(new { error = generic });

        Response.Cookies.Append(PortalTokenService.CookieName, tokens.CreateToken(new PortalSession(account.CustomerId, account.Name)), new CookieOptions
        {
            HttpOnly = true,
            Secure = !env.IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/",
            MaxAge = TimeSpan.FromSeconds(PortalTokenService.TtlSeconds),
        });
        await audit.LogAsync(null, "LOGIN", "PORTAL", account.CustomerId, $"Customer portal: {account.Name}");
        return Ok(new { name = account.Name });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(PortalTokenService.CookieName, new CookieOptions { Path = "/" });
        return Ok(new { ok = true });
    }

    private record ProfileRow(int Id, string Name, string Mobile, string? Email, string? Address, string? City, string? State, string? Pincode, string? Gstin, decimal OpeningBalance);
    private record TotalsRow(decimal TotalBilled, decimal TotalPaid, decimal TotalDue, int OpenInvoices);
    private record InvoiceRow(int Id, string InvoiceNumber, DateTime InvoiceDate, decimal GrandTotal, decimal PaidAmount, decimal DueAmount, string PaymentStatus, string Status);
    private record PaymentRow(int Id, string PaymentNumber, DateTime Date, decimal Amount, string Method, string? InvoiceNumber);
    private record CreditNoteRow(string ReturnNumber, DateTime ReturnDate, decimal TotalAmount, string InvoiceNumber, string RefundMethod);

    [HttpGet("summary")]
    [RequirePortalSession]
    public async Task<IActionResult> Summary()
    {
        var portal = HttpContext.GetPortal();
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Portal_Summary", new { CustomerId = portal.CustomerId }, commandType: CommandType.StoredProcedure);
        var profile = await multi.ReadSingleOrDefaultAsync<ProfileRow>();
        if (profile is null) return Unauthorized(new { error = "Account not found" });
        var totals = await multi.ReadSingleAsync<TotalsRow>();
        var invoices = (await multi.ReadAsync<InvoiceRow>()).ToList();
        var payments = (await multi.ReadAsync<PaymentRow>()).ToList();
        var credits = (await multi.ReadAsync<CreditNoteRow>()).ToList();
        var business = await connection.QuerySingleOrDefaultAsync<BusinessInfo>("dbo.sp_Business_Get", commandType: CommandType.StoredProcedure);

        return Ok(new
        {
            business = business is null ? null : new
            {
                name = business.Name, address = business.Address, phone = business.Phone, email = business.Email,
                gstin = business.Gstin, upiId = business.UpiId,
            },
            customer = new
            {
                id = profile.Id, name = profile.Name, mobile = profile.Mobile, email = profile.Email, address = profile.Address,
                city = profile.City, state = profile.State, gstin = profile.Gstin,
            },
            totals = new { totalBilled = totals.TotalBilled, totalPaid = totals.TotalPaid, totalDue = totals.TotalDue, openInvoices = totals.OpenInvoices },
            invoices = invoices.Select(i => new
            {
                id = i.Id, invoiceNumber = i.InvoiceNumber, invoiceDate = i.InvoiceDate, grandTotal = i.GrandTotal,
                paidAmount = i.PaidAmount, dueAmount = i.DueAmount, paymentStatus = i.PaymentStatus, status = i.Status,
            }),
            payments = payments.Select(p => new { id = p.Id, paymentNumber = p.PaymentNumber, date = p.Date, amount = p.Amount, method = p.Method, invoiceNumber = p.InvoiceNumber }),
            creditNotes = credits.Select(c => new { returnNumber = c.ReturnNumber, returnDate = c.ReturnDate, totalAmount = c.TotalAmount, invoiceNumber = c.InvoiceNumber, refundMethod = c.RefundMethod }),
        });
    }

    private record SaleHeader(int Id, string InvoiceNumber, DateTime InvoiceDate, int? CustomerId, decimal Subtotal, decimal Discount,
        decimal TaxableAmount, decimal Cgst, decimal Sgst, decimal Igst, decimal GrandTotal, decimal PaidAmount, decimal DueAmount,
        string PaymentStatus, string PaymentMethod, string Status, string? CancelReason, int CreatedById, DateTime CreatedAt);

    private class SaleItemRow
    {
        public string ProductName { get; set; } = "";
        public decimal Quantity { get; set; }
        public decimal Rate { get; set; }
        public decimal Discount { get; set; }
        public decimal GstRate { get; set; }
        public decimal Total { get; set; }
        public string? Product_HsnCode { get; set; }
    }

    [HttpGet("invoices/{id:int}")]
    [RequirePortalSession]
    public async Task<IActionResult> Invoice(int id)
    {
        var portal = HttpContext.GetPortal();
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Sale_GetById", new { SaleId = id }, commandType: CommandType.StoredProcedure);
        var sale = await multi.ReadSingleOrDefaultAsync<SaleHeader>();
        // Same 404 for "doesn't exist" and "belongs to someone else" — never confirm other customers' invoice ids.
        if (sale is null || sale.CustomerId != portal.CustomerId) return NotFound(new { error = "Invoice not found" });
        var customer = await multi.ReadSingleOrDefaultAsync<dynamic>();
        await multi.ReadSingleOrDefaultAsync<string>(); // created-by name — not exposed to customers
        var items = (await multi.ReadAsync<SaleItemRow>()).ToList();

        return Ok(new
        {
            id = sale.Id, invoiceNumber = sale.InvoiceNumber, invoiceDate = sale.InvoiceDate, subtotal = sale.Subtotal,
            discount = sale.Discount, cgst = sale.Cgst, sgst = sale.Sgst, igst = sale.Igst, grandTotal = sale.GrandTotal,
            paidAmount = sale.PaidAmount, dueAmount = sale.DueAmount, paymentStatus = sale.PaymentStatus,
            paymentMethod = sale.PaymentMethod, status = sale.Status,
            customer = customer is null ? null : new { name = (string)customer.Name, mobile = (string)customer.Mobile, address = (string?)customer.Address, gstin = (string?)customer.Gstin },
            items = items.Select(i => new { productName = i.ProductName, hsnCode = i.Product_HsnCode, quantity = i.Quantity, rate = i.Rate, discount = i.Discount, gstRate = i.GstRate, total = i.Total }),
        });
    }
}

public record PortalAccessRequest(bool Enabled, string? Password);

// Staff side: turn portal access on/off for a customer and set their password.
[ApiController]
[RequirePlanFeature("PORTAL")]
[Route("api/customers/{customerId:int}/portal")]
public class CustomerPortalAdminController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record StatusRow(int CustomerId, string Name, string Mobile, bool HasAccount, bool IsEnabled, DateTime? LastLoginAt, DateTime? LockedUntil);

    [HttpGet]
    [RequirePermission("CUSTOMERS", "VIEW")]
    public async Task<IActionResult> Get(int customerId)
    {
        using var connection = connectionFactory.Create();
        var s = await connection.QuerySingleOrDefaultAsync<StatusRow>("dbo.sp_Portal_GetStatus", new { CustomerId = customerId }, commandType: CommandType.StoredProcedure);
        if (s is null) return NotFound(new { error = "Customer not found" });
        return Ok(new
        {
            customerId = s.CustomerId, name = s.Name, mobile = s.Mobile, hasAccount = s.HasAccount, isEnabled = s.IsEnabled,
            lastLoginAt = s.LastLoginAt is null ? (DateTime?)null : DateTime.SpecifyKind(s.LastLoginAt.Value, DateTimeKind.Utc),
            locked = s.LockedUntil is not null && s.LockedUntil > DateTime.UtcNow,
        });
    }

    [HttpPut]
    [RequirePermission("CUSTOMERS", "EDIT")]
    public async Task<IActionResult> Save(int customerId, [FromBody] PortalAccessRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });
        var password = body.Password?.Trim();
        if (!string.IsNullOrEmpty(password) && password.Length < 6) return BadRequest(new { error = "Password must be at least 6 characters" });

        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("CustomerId", customerId);
        p.Add("PasswordHash", string.IsNullOrEmpty(password) ? null : PasswordHasher.Hash(password));
        p.Add("IsEnabled", body.Enabled);
        p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Portal_Save", p, commandType: CommandType.StoredProcedure);
        switch (p.Get<int>("Result"))
        {
            case 1: return NotFound(new { error = "Customer not found" });
            case 2: return BadRequest(new { error = "Set a password to give this customer portal access" });
        }

        var session = HttpContext.GetSession()!;
        await audit.LogAsync(session.UserId, "UPDATE", "CUSTOMERS", customerId,
            $"Portal access {(body.Enabled ? "enabled" : "disabled")}{(string.IsNullOrEmpty(password) ? "" : ", password set")}");
        return await Get(customerId);
    }
}
