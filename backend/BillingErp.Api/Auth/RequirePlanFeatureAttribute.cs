using BillingErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace BillingErp.Api.Auth;

// Blocks a whole controller (or action) when the business's plan doesn't include `feature`
// (see PlanFeatures). Returns 402 Payment Required with { error, code: "PLAN_REQUIRED" }.
// Runs alongside [RequirePermission] — a role check and a plan check are independent.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequirePlanFeatureAttribute(string feature) : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var planAccess = context.HttpContext.RequestServices.GetRequiredService<PlanAccessService>();
        var error = await planAccess.CheckFeatureAsync(feature);
        if (error is not null)
        {
            context.Result = new JsonResult(new { error, code = "PLAN_REQUIRED", feature }) { StatusCode = 402 };
            return;
        }

        await next();
    }
}
