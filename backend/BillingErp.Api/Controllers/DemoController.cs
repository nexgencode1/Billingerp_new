using BillingErp.Api.Auth;
using BillingErp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Settings → Backup & Data → "Load demo data". All rows are written through the normal
// stored procedures by DemoDataService (see the comment there).
[ApiController]
[Route("api/demo")]
public class DemoController(DemoDataService demo, AuditService audit) : ControllerBase
{
    [HttpGet("status")]
    [RequirePermission("SETTINGS", "VIEW")]
    public async Task<IActionResult> Status()
    {
        var s = await demo.GetStatusAsync();
        return Ok(new
        {
            isLoaded = s.IsLoaded && s.HasExtras && s.HasExtras2, coreLoaded = s.IsLoaded, hasExtras = s.HasExtras && s.HasExtras2, products = s.Products, customers = s.Customers, suppliers = s.Suppliers,
            sales = s.Sales, purchases = s.Purchases, payments = s.Payments, expenses = s.Expenses,
        });
    }

    [HttpPost("load")]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Load()
    {
        var status = await demo.GetStatusAsync();
        if (status.IsLoaded && status.HasExtras && status.HasExtras2)
            return Conflict(new { error = "Demo data is already loaded." });

        var session = HttpContext.GetSession()!;
        var r = await demo.LoadAsync(session.UserId, coreAlreadyLoaded: status.IsLoaded, extrasAlreadyLoaded: status.HasExtras);
        await audit.LogAsync(session.UserId, "CREATE", "SETTINGS", null, "Demo data loaded");

        return Ok(new
        {
            products = r.Products, customers = r.Customers, suppliers = r.Suppliers, sales = r.Sales,
            purchases = r.Purchases, payments = r.Payments, expenses = r.Expenses, leads = r.Leads, employees = r.Employees,
            documents = r.Documents, deposits = r.Deposits, extras = r.Extras2,
            portalLogins = new { password = DemoDataService.DemoPortalPassword, note = "Demo customers Amit Traders (9000100001), Neha Gupta (9000100004), Rohit Electronics (9000100003)" },
        });
    }
}
