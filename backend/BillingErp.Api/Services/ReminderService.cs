using System.Data;
using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

public class ReminderCustomerRow
{
    public int CustomerId { get; set; }
    public string Name { get; set; } = "";
    public string Mobile { get; set; } = "";
    public string? Email { get; set; }
    public int InvoiceCount { get; set; }
    public decimal TotalDue { get; set; }
    public DateTime OldestInvoiceDate { get; set; }
    public int OldestDays { get; set; }
    public DateTime? LastRemindedAt { get; set; }
    public string? LastChannel { get; set; }
    public List<ReminderInvoiceRow> Invoices { get; set; } = new();
}

public class ReminderInvoiceRow
{
    public int SaleId { get; set; }
    public int CustomerId { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public DateTime InvoiceDate { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal DueAmount { get; set; }
    public int DaysOld { get; set; }
}

// Payment reminders: who owes what, plus email sending over the business's own SMTP (Gmail /
// domain SMTP — free). Nothing is sent unless Smtp:Host is configured. WhatsApp reminders are
// click-to-chat links opened by the user, only logged here.
// TODO: paid option — SMS / WhatsApp Business API for fully automatic bulk reminders.
public class ReminderService(SqlConnectionFactory connectionFactory, IConfiguration config)
{
    public int AfterDays => Math.Max(0, config.GetValue("Reminders:AfterDays", 7));
    public int MinDaysBetween => Math.Max(1, config.GetValue("Reminders:MinDaysBetween", 7));
    public bool AutoEmailEnabled => config.GetValue("Reminders:AutoEmailEnabled", false);
    public bool SmtpConfigured => !string.IsNullOrWhiteSpace(config["Smtp:Host"]) && !string.IsNullOrWhiteSpace(config["Smtp:FromEmail"]);

    public async Task<List<ReminderCustomerRow>> CandidatesAsync(int? customerId = null)
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Reminder_Candidates",
            new { OlderThanDays = AfterDays, CustomerId = customerId }, commandType: CommandType.StoredProcedure);
        var customers = (await multi.ReadAsync<ReminderCustomerRow>()).ToList();
        var invoices = (await multi.ReadAsync<ReminderInvoiceRow>()).ToLookup(i => i.CustomerId);
        foreach (var c in customers) c.Invoices = invoices[c.CustomerId].ToList();
        return customers;
    }

    public async Task LogAsync(ReminderCustomerRow customer, string channel, string status, string? error, bool automatic, int? userId)
    {
        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_Reminder_Log", new
        {
            CustomerId = customer.CustomerId,
            SaleIdsJson = JsonSerializer.Serialize(customer.Invoices.Select(i => i.SaleId)),
            Channel = channel,
            Status = status,
            Error = error is { Length: > 1000 } ? error[..1000] : error,
            IsAutomatic = automatic,
            CreatedById = userId,
        }, commandType: CommandType.StoredProcedure);
    }

    public static string MessageBody(ReminderCustomerRow c, string businessName, string? upiId)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Dear {c.Name},");
        sb.AppendLine();
        sb.AppendLine($"This is a friendly reminder that the following invoice(s) from {businessName} are pending:");
        sb.AppendLine();
        foreach (var i in c.Invoices)
            sb.AppendLine($"  • {i.InvoiceNumber} dated {i.InvoiceDate:dd-MM-yyyy} — due Rs. {i.DueAmount:N2} ({i.DaysOld} days)");
        sb.AppendLine();
        sb.AppendLine($"Total outstanding: Rs. {c.TotalDue:N2}");
        if (!string.IsNullOrWhiteSpace(upiId)) sb.AppendLine($"You can pay via UPI to: {upiId}");
        sb.AppendLine();
        sb.AppendLine("Please ignore this message if you have already paid. Thank you!");
        sb.AppendLine($"— {businessName}");
        return sb.ToString();
    }

    // Returns null on success, or the error message.
    public async Task<string?> SendEmailAsync(string to, string subject, string body)
    {
        if (!SmtpConfigured) return "Email (SMTP) is not configured.";
        try
        {
            using var client = new SmtpClient(config["Smtp:Host"], config.GetValue("Smtp:Port", 587))
            {
                EnableSsl = config.GetValue("Smtp:EnableSsl", true),
                DeliveryMethod = SmtpDeliveryMethod.Network,
                Timeout = 20_000,
            };
            var user = config["Smtp:User"];
            if (!string.IsNullOrWhiteSpace(user)) client.Credentials = new NetworkCredential(user, config["Smtp:Password"]);

            using var message = new MailMessage
            {
                From = new MailAddress(config["Smtp:FromEmail"]!, config["Smtp:FromName"] ?? ""),
                Subject = subject,
                Body = body,
                IsBodyHtml = false,
            };
            message.To.Add(to);
            await client.SendMailAsync(message);
            return null;
        }
        catch (Exception ex)
        {
            return ex.Message;
        }
    }
}

// Daily automatic email reminders — only when Reminders:AutoEmailEnabled = true AND SMTP is set.
// Each customer is emailed at most once every Reminders:MinDaysBetween days.
public class ReminderWorker(IServiceScopeFactory scopes, ILogger<ReminderWorker> logger, IConfiguration config) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync();
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Reminder pass failed");
            }
            var hours = Math.Max(1, config.GetValue("Reminders:CheckEveryHours", 24));
            await Task.Delay(TimeSpan.FromHours(hours), stoppingToken);
        }
    }

    private async Task RunOnceAsync()
    {
        using var scope = scopes.CreateScope();
        var reminders = scope.ServiceProvider.GetRequiredService<ReminderService>();
        if (!reminders.AutoEmailEnabled || !reminders.SmtpConfigured) return;

        var connectionFactory = scope.ServiceProvider.GetRequiredService<SqlConnectionFactory>();
        using var connection = connectionFactory.Create();
        var business = await connection.QuerySingleOrDefaultAsync<(string Name, string? UpiId)>(
            "dbo.sp_Business_ReminderInfo", commandType: CommandType.StoredProcedure);

        var cutoff = DateTime.UtcNow.AddDays(-reminders.MinDaysBetween);
        foreach (var c in await reminders.CandidatesAsync())
        {
            if (c.Email is null || (c.LastRemindedAt is not null && c.LastRemindedAt > cutoff)) continue;
            var error = await reminders.SendEmailAsync(c.Email, $"Payment reminder from {business.Name}", ReminderService.MessageBody(c, business.Name, business.UpiId));
            await reminders.LogAsync(c, "EMAIL", error is null ? "SENT" : "FAILED", error, automatic: true, userId: null);
            if (error is null) logger.LogInformation("Reminder emailed to {Customer}", c.Name);
            else logger.LogWarning("Reminder to {Customer} failed: {Error}", c.Name, error);
        }
    }
}
