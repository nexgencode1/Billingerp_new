using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Header bell: low stock, overdue receivables, expired open quotes/orders. Any logged-in user can
// call it, but each section is only included if their role can view the underlying module.
[ApiController]
[Route("api/alerts")]
public class AlertsController(SqlConnectionFactory connectionFactory, IPermissionService permissions, IConfiguration config) : ControllerBase
{
    private const int MaxItemsPerSection = 8;

    private record StockAlertRow(int Id, string Name, string Sku, decimal MinimumStock, decimal Balance, string UnitLabel);
    private record OverdueRow(int Id, string InvoiceNumber, DateTime InvoiceDate, decimal DueAmount, string? CustomerName, int DaysOld);
    private record DocAlertRow(int Id, string DocType, string DocNumber, DateTime DueDate, decimal GrandTotal, string? CustomerName);

    private static readonly Dictionary<string, string> DocRoutes = new()
    {
        ["ESTIMATE"] = "estimates", ["SALE_ORDER"] = "orders", ["DELIVERY_CHALLAN"] = "challans",
    };

    [HttpGet]
    [RequireSession]
    public async Task<IActionResult> Get()
    {
        var session = HttpContext.GetSession()!;
        var canStock = await permissions.CanAsync(session.RoleId, "INVENTORY", "VIEW")
                       || await permissions.CanAsync(session.RoleId, "PRODUCTS", "VIEW");
        var canSales = await permissions.CanAsync(session.RoleId, "SALES", "VIEW");

        // Business rule, not a tax rule — configurable in appsettings ("Alerts:OverdueDays").
        var overdueDays = config.GetValue("Alerts:OverdueDays", 30);

        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Alerts_Summary", new { OverdueDays = overdueDays }, commandType: CommandType.StoredProcedure);
        var stock = (await multi.ReadAsync<StockAlertRow>()).ToList();
        var overdue = (await multi.ReadAsync<OverdueRow>()).ToList();
        var docs = (await multi.ReadAsync<DocAlertRow>()).ToList();

        if (!canStock) stock.Clear();
        if (!canSales) { overdue.Clear(); docs.Clear(); }

        return Ok(new
        {
            total = stock.Count + overdue.Count + docs.Count,
            overdueDays,
            lowStock = new
            {
                count = stock.Count,
                outOfStock = stock.Count(s => s.Balance <= 0),
                items = stock.Take(MaxItemsPerSection).Select(s => new
                {
                    id = s.Id, name = s.Name, sku = s.Sku, balance = s.Balance, minimumStock = s.MinimumStock, unit = s.UnitLabel,
                }),
            },
            overdueInvoices = new
            {
                count = overdue.Count,
                amount = overdue.Sum(o => o.DueAmount),
                items = overdue.Take(MaxItemsPerSection).Select(o => new
                {
                    id = o.Id, invoiceNumber = o.InvoiceNumber, invoiceDate = o.InvoiceDate, dueAmount = o.DueAmount,
                    customerName = o.CustomerName, daysOld = o.DaysOld,
                }),
            },
            expiredDocuments = new
            {
                count = docs.Count,
                items = docs.Take(MaxItemsPerSection).Select(d => new
                {
                    id = d.Id, docType = d.DocType, route = DocRoutes.GetValueOrDefault(d.DocType, "estimates"),
                    docNumber = d.DocNumber, dueDate = d.DueDate, grandTotal = d.GrandTotal, customerName = d.CustomerName,
                }),
            },
        });
    }
}
