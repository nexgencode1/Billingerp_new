using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record ReminderLogRequest(string? Channel);

[ApiController]
[Route("api/reminders")]
public class RemindersController(ReminderService reminders, SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    [HttpGet]
    [RequirePermission("PAYMENTS", "VIEW")]
    public async Task<IActionResult> List()
    {
        var customers = await reminders.CandidatesAsync();
        var (businessName, upiId) = await BusinessAsync();
        return Ok(new
        {
            settings = new
            {
                smtpConfigured = reminders.SmtpConfigured, autoEmailEnabled = reminders.AutoEmailEnabled,
                afterDays = reminders.AfterDays, minDaysBetween = reminders.MinDaysBetween,
            },
            businessName, upiId,
            totalDue = customers.Sum(c => c.TotalDue),
            customers = customers.Select(c => new
            {
                customerId = c.CustomerId, name = c.Name, mobile = c.Mobile, email = c.Email, invoiceCount = c.InvoiceCount,
                totalDue = c.TotalDue, oldestInvoiceDate = c.OldestInvoiceDate, oldestDays = c.OldestDays,
                lastRemindedAt = c.LastRemindedAt is null ? (DateTime?)null : DateTime.SpecifyKind(c.LastRemindedAt.Value, DateTimeKind.Utc),
                lastChannel = c.LastChannel,
                message = ReminderService.MessageBody(c, businessName, upiId),
                invoices = c.Invoices.Select(i => new
                {
                    saleId = i.SaleId, invoiceNumber = i.InvoiceNumber, invoiceDate = i.InvoiceDate, grandTotal = i.GrandTotal,
                    dueAmount = i.DueAmount, daysOld = i.DaysOld,
                }),
            }),
        });
    }

    [HttpPost("{customerId:int}/email")]
    [RequirePermission("PAYMENTS", "CREATE")]
    public async Task<IActionResult> Email(int customerId)
    {
        var customer = (await reminders.CandidatesAsync(customerId)).FirstOrDefault();
        if (customer is null) return NotFound(new { error = "This customer has no overdue invoices" });
        if (customer.Email is null) return BadRequest(new { error = "Customer has no email address" });
        if (!reminders.SmtpConfigured) return BadRequest(new { error = "Email is not configured — set the Smtp section in appsettings" });

        var session = HttpContext.GetSession()!;
        var (businessName, upiId) = await BusinessAsync();
        var error = await reminders.SendEmailAsync(customer.Email, $"Payment reminder from {businessName}", ReminderService.MessageBody(customer, businessName, upiId));
        await reminders.LogAsync(customer, "EMAIL", error is null ? "SENT" : "FAILED", error, automatic: false, userId: session.UserId);
        if (error is not null) return StatusCode(502, new { error = $"Email failed: {error}" });

        await audit.LogAsync(session.UserId, "CREATE", "PAYMENTS", customerId, $"Payment reminder emailed to {customer.Name}");
        return Ok(new { success = true });
    }

    // The WhatsApp message is sent by the user from their own app; this just records that they did.
    [HttpPost("{customerId:int}/log")]
    [RequirePermission("PAYMENTS", "CREATE")]
    public async Task<IActionResult> Log(int customerId, [FromBody] ReminderLogRequest? body)
    {
        var channel = body?.Channel?.Trim().ToUpperInvariant();
        if (channel is not ("WHATSAPP" or "EMAIL")) return BadRequest(new { error = "Channel must be WHATSAPP or EMAIL" });
        var customer = (await reminders.CandidatesAsync(customerId)).FirstOrDefault();
        if (customer is null) return NotFound(new { error = "This customer has no overdue invoices" });

        var session = HttpContext.GetSession()!;
        await reminders.LogAsync(customer, channel, "SENT", null, automatic: false, userId: session.UserId);
        return Ok(new { success = true });
    }

    private async Task<(string Name, string? UpiId)> BusinessAsync()
    {
        using var connection = connectionFactory.Create();
        var b = await connection.QuerySingleOrDefaultAsync<(string Name, string? UpiId)>("dbo.sp_Business_ReminderInfo", commandType: CommandType.StoredProcedure);
        return (b.Name ?? "", b.UpiId);
    }
}
