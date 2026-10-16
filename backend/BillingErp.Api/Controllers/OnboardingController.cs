using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Dashboard "Getting started" checklist. Each step is done when real data exists for it, so the
// list updates itself as the business is set up; steps are only listed for modules the role can use.
[ApiController]
[Route("api/onboarding")]
public class OnboardingController(SqlConnectionFactory connectionFactory, PlanAccessService planAccess, IPermissionService permissions) : ControllerBase
{
    private record StatusRow(bool BusinessProfile, bool HasProducts, bool HasCustomers, bool HasSales, bool HasPaymentsReceived, bool HasTeam);

    [HttpGet]
    [RequirePermission("DASHBOARD", "VIEW")]
    public async Task<IActionResult> Get()
    {
        using var connection = connectionFactory.Create();
        var status = await connection.QuerySingleAsync<StatusRow>("dbo.sp_Onboarding_Status", commandType: CommandType.StoredProcedure);
        var plan = await planAccess.GetAsync();
        var roleId = HttpContext.GetSession()!.RoleId;

        // (key, module/action needed to act on it, done?)
        var candidates = new (string Key, string Module, string Action, bool Done)[]
        {
            ("business", "SETTINGS", "EDIT", status.BusinessProfile),
            ("plan", "SETTINGS", "EDIT", plan.Active),
            ("products", "PRODUCTS", "CREATE", status.HasProducts),
            ("customers", "CUSTOMERS", "CREATE", status.HasCustomers),
            ("invoice", "SALES", "CREATE", status.HasSales),
            ("payment", "PAYMENTS", "CREATE", status.HasPaymentsReceived),
            ("team", "USERS", "CREATE", status.HasTeam),
        };

        var steps = new List<object>();
        foreach (var step in candidates)
        {
            if (await permissions.CanAsync(roleId, step.Module, step.Action))
                steps.Add(new { key = step.Key, done = step.Done });
        }
        return Ok(new { steps });
    }
}
