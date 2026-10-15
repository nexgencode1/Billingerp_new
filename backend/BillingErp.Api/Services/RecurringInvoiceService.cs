using System.Data;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using Dapper;

namespace BillingErp.Api.Services;

public class RecurringTemplateRow
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string Frequency { get; set; } = "MONTHLY";
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public DateTime NextRunDate { get; set; }
    public bool IsActive { get; set; }
    public DateTime? LastRunAt { get; set; }
    public int? LastSaleId { get; set; }
    public string? LastInvoiceNumber { get; set; }
    public string? LastError { get; set; }
    public int RunCount { get; set; }
    public string? Notes { get; set; }
    public int CreatedById { get; set; }
    public DateTime CreatedAt { get; set; }
    public int ItemCount { get; set; }
    public decimal TaxableValue { get; set; }
    public List<RecurringItemRow> Items { get; set; } = new();
}

public class RecurringItemRow
{
    public int Id { get; set; }
    public int RecurringInvoiceId { get; set; }
    public int ProductId { get; set; }
    public string ProductName { get; set; } = "";
    public decimal Quantity { get; set; }
    public decimal Rate { get; set; }
    public decimal Discount { get; set; }
    public decimal GstRate { get; set; }
}

public record RecurringRunResult(int TemplateId, string Name, bool Success, string? InvoiceNumber, string? Error);

// Generates invoices from recurring templates through SaleService (same rules as a manual sale).
// Invoices are created on credit (no payment) dated on their scheduled date.
public class RecurringInvoiceService(SqlConnectionFactory connectionFactory, SaleService sales, AuditService audit)
{
    public static readonly string[] Frequencies = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];
    private const int MaxCatchUpRunsPerPass = 12;

    // Occurrence n (0-based) is always computed from the start date, so month-end schedules don't
    // drift (31 Jan → 28 Feb → 31 Mar, not → 28 Mar).
    public static DateTime Occurrence(DateTime start, string frequency, int n) => frequency switch
    {
        "WEEKLY" => start.AddDays(7 * n),
        "QUARTERLY" => start.AddMonths(3 * n),
        "YEARLY" => start.AddYears(n),
        _ => start.AddMonths(n),
    };

    public async Task<List<RecurringTemplateRow>> ListAsync(bool dueOnly = false, DateTime? asOf = null, int? id = null)
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Recurring_List",
            new { DueOnly = dueOnly, AsOf = asOf, RecurringId = id }, commandType: CommandType.StoredProcedure);
        var templates = (await multi.ReadAsync<RecurringTemplateRow>()).ToList();
        var items = (await multi.ReadAsync<RecurringItemRow>()).ToLookup(i => i.RecurringInvoiceId);
        foreach (var t in templates) t.Items = items[t.Id].ToList();
        return templates;
    }

    // Runs every occurrence that is due on/before `asOf` (catching up after downtime, capped per pass).
    public async Task<List<RecurringRunResult>> RunDueAsync(DateTime asOf)
    {
        var results = new List<RecurringRunResult>();
        foreach (var template in await ListAsync(dueOnly: true, asOf: asOf))
        {
            var current = template;
            for (var i = 0; i < MaxCatchUpRunsPerPass && current.IsActive && current.NextRunDate <= asOf
                            && (current.EndDate is null || current.NextRunDate <= current.EndDate); i++)
            {
                var result = await RunOnceAsync(current, current.NextRunDate, isAutomatic: true);
                results.Add(result);
                if (!result.Success) break;
                current = (await ListAsync(id: current.Id)).FirstOrDefault() ?? current;
            }
        }
        return results;
    }

    // Creates one invoice for the template's next occurrence, dated `invoiceDate`.
    public async Task<RecurringRunResult> RunOnceAsync(RecurringTemplateRow template, DateTime invoiceDate, bool isAutomatic)
    {
        var request = new SaleCreateRequest(
            invoiceDate,
            template.CustomerId,
            template.Items.Select(i => new SaleItemInput(i.ProductId, i.ProductName, i.Quantity, i.Rate, i.Discount, i.GstRate)).ToList(),
            Payments: null);
        var outcome = await sales.CreateAsync(request, template.CreatedById);

        var nextRun = Occurrence(template.StartDate, template.Frequency, template.RunCount + 1);
        var deactivate = outcome.Ok && template.EndDate is not null && nextRun > template.EndDate;

        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_Recurring_RecordRun", new
        {
            RecurringId = template.Id,
            SaleId = outcome.SaleId,
            NextRunDate = outcome.Ok ? nextRun : (DateTime?)null,
            Error = outcome.Ok ? null : outcome.Error,
            Deactivate = deactivate,
        }, commandType: CommandType.StoredProcedure);

        if (outcome.Ok)
            await audit.LogAsync(template.CreatedById, "CREATE", "SALES", outcome.SaleId,
                $"{outcome.InvoiceNumber} ({(isAutomatic ? "auto" : "manual")} recurring: {template.Name})");

        return new RecurringRunResult(template.Id, template.Name, outcome.Ok, outcome.InvoiceNumber, outcome.Error);
    }
}

// Background job: every Recurring:IntervalMinutes (default 30) creates the invoices that are due.
public class RecurringInvoiceWorker(IServiceScopeFactory scopes, ILogger<RecurringInvoiceWorker> logger, IConfiguration config) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, config.GetValue("Recurring:IntervalMinutes", 30)));
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); // let startup (migrations, SPs, seed) finish first

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<RecurringInvoiceService>();
                var results = await service.RunDueAsync(DateTime.Today);
                foreach (var r in results)
                {
                    if (r.Success) logger.LogInformation("Recurring '{Name}' created {Invoice}", r.Name, r.InvoiceNumber);
                    else logger.LogWarning("Recurring '{Name}' failed: {Error}", r.Name, r.Error);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Recurring invoice pass failed");
            }
            await Task.Delay(interval, stoppingToken);
        }
    }
}
