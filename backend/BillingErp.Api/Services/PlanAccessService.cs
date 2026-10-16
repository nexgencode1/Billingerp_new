using System.Data;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

// Feature keys a plan can lock (SubscriptionPlans.LockedFeatures). Frontend mirror: src/lib/plan-store.ts.
public static class PlanFeatures
{
    public static readonly Dictionary<string, string> Labels = new()
    {
        ["CRM"] = "CRM",
        ["HR"] = "HR & Payroll",
        ["MANUFACTURING"] = "Manufacturing",
        ["GST_RETURNS"] = "GSTR-1 / GSTR-3B export",
        ["PORTAL"] = "Customer portal",
        ["RECURRING"] = "Recurring invoices",
        ["AI_REPORTS"] = "Ask your business (AI reports)",
    };
}

// Status: ACTIVE | TRIAL | TRIAL_EXHAUSTED | NONE | PENDING | EXPIRED | ENDED | CANCELLED
// (CANCELS_AT_PERIOD_END is reported as ACTIVE here, with CancelAtPeriodEnd = true).
public record PlanEntitlement(
    string Status, bool Active, int? PlanId, string? PlanName, string? Tier, DateTime? PaidUntil, bool CancelAtPeriodEnd,
    int? InvoiceLimit, string? InvoiceLimitPeriod, int InvoicesUsed, int? MaxUsers, int ActiveUsers,
    IReadOnlyCollection<string> LockedFeatures, bool TrialAvailable)
{
    public int? InvoicesLeft => InvoiceLimit is null ? null : Math.Max(0, InvoiceLimit.Value - InvoicesUsed);
}

// What the business's current plan allows. Used by SaleService (bill limit), UsersController (user
// limit) and [RequirePlanFeature] (module locks). Without an active plan nothing premium is open and
// no new bills can be made — reading existing data always keeps working.
public class PlanAccessService(SubscriptionService subscriptions, SqlConnectionFactory connectionFactory)
{
    private PlanEntitlement? cached; // per request (scoped service)

    public async Task<PlanEntitlement> GetAsync()
    {
        if (cached is not null) return cached;

        var state = await subscriptions.StateAsync();
        var plan = state.HasAccess && state.CurrentPeriod is { } period
            ? (await subscriptions.PlansAsync(activeOnly: false)).FirstOrDefault(p => p.Id == period.PlanId)
            : null;

        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var invoiceSince = plan?.InvoiceLimitPeriod == "TOTAL" ? state.CurrentPeriod!.PeriodStart!.Value : monthStart;

        using var connection = connectionFactory.Create();
        var usage = await connection.QuerySingleAsync<(int InvoicesUsed, int ActiveUsers)>(
            "dbo.sp_Subscription_Usage", new { InvoiceSince = invoiceSince }, commandType: CommandType.StoredProcedure);

        var allFeatures = PlanFeatures.Labels.Keys.ToArray();
        if (plan is null)
        {
            var status = state.DisplayStatus is "CANCELS_AT_PERIOD_END" ? "ACTIVE" : state.DisplayStatus;
            return cached = new PlanEntitlement(status, false, null, null, null, null, false, 0, null,
                usage.InvoicesUsed, null, usage.ActiveUsers, allFeatures, !state.TrialUsed);
        }

        var exhausted = plan.Tier == "TRIAL" && plan.InvoiceLimit is { } trialLimit && usage.InvoicesUsed >= trialLimit;
        var locked = exhausted
            ? allFeatures
            : (plan.LockedFeatures ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return cached = new PlanEntitlement(
            plan.Tier == "TRIAL" ? (exhausted ? "TRIAL_EXHAUSTED" : "TRIAL") : "ACTIVE",
            !exhausted, plan.Id, plan.Name, plan.Tier,
            plan.Tier == "TRIAL" ? null : state.PaidUntil, state.DisplayStatus == "CANCELS_AT_PERIOD_END",
            plan.InvoiceLimit, plan.InvoiceLimitPeriod, usage.InvoicesUsed, plan.MaxUsers, usage.ActiveUsers,
            locked, false);
    }

    // null = allowed; otherwise the message to show (HTTP 402).
    public async Task<string?> CheckNewInvoiceAsync()
    {
        var e = await GetAsync();
        if (e.Status == "TRIAL_EXHAUSTED")
            return $"Your free trial's {e.InvoiceLimit} bills are used up. Choose a plan in Settings → Subscription to keep billing.";
        if (!e.Active)
            return "No active plan. Start your free trial or choose a plan in Settings → Subscription.";
        if (e.InvoiceLimit is { } limit && e.InvoicesUsed >= limit)
            return e.InvoiceLimitPeriod == "MONTH"
                ? $"This month's limit of {limit} bills on the {e.PlanName} plan is reached. Upgrade to Pro for unlimited bills."
                : $"The {limit}-bill limit of the {e.PlanName} plan is reached. Upgrade to keep billing.";
        return null;
    }

    public async Task<string?> CheckNewUserAsync()
    {
        var e = await GetAsync();
        if (!e.Active) return "No active plan. Start your free trial or choose a plan in Settings → Subscription.";
        if (e.MaxUsers is { } max && e.ActiveUsers >= max)
            return $"The {e.PlanName} plan allows up to {max} active users. Upgrade to Pro for unlimited users.";
        return null;
    }

    public async Task<string?> CheckFeatureAsync(string feature)
    {
        var e = await GetAsync();
        if (!e.LockedFeatures.Contains(feature)) return null;
        var label = PlanFeatures.Labels.GetValueOrDefault(feature, feature);
        return e.Active
            ? $"{label} is not included in your {e.PlanName} plan. Upgrade to Pro in Settings → Subscription."
            : $"{label} needs an active plan. Start your free trial or choose a plan in Settings → Subscription.";
    }
}
