using System.Text.Json;
using BillingErp.Api.Auth;
using BillingErp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record SubscriptionCheckoutRequest(int PlanId);
public record SubscriptionConfirmRequest(string? RazorpayOrderId, string? RazorpayPaymentId, string? RazorpaySignature);
public record SubscriptionFailedRequest(string? RazorpayOrderId, string? RazorpayPaymentId, string? Description);
public record SubscriptionCancelRequest(string? Mode, string? Reason);

// Software subscription (Settings → Subscription). Viewing needs SETTINGS VIEW; paying / cancelling
// needs SETTINGS EDIT. The Razorpay webhook is the only anonymous endpoint and is authenticated by
// its HMAC signature instead.
[ApiController]
[Route("api/subscription")]
public class SubscriptionController(SubscriptionService subscriptions, PlanAccessService planAccess, RazorpayService razorpay, ILogger<SubscriptionController> logger) : ControllerBase
{
    [HttpGet]
    [RequirePermission("SETTINGS", "VIEW")]
    public async Task<IActionResult> Get()
    {
        var now = DateTime.UtcNow;
        var plans = await subscriptions.PlansAsync();
        var state = await subscriptions.StateAsync();
        var history = await subscriptions.PaymentHistoryAsync();
        var refundPreview = subscriptions.RefundPreview(state, now);
        var daysLeft = state.PaidUntil is { } until && until > now && !state.OnTrial ? (int)Math.Ceiling((until - now).TotalDays) : 0;
        var entitlement = await planAccess.GetAsync();

        return Ok(new
        {
            gateway = new { configured = razorpay.IsConfigured, testMode = razorpay.IsTestMode, webhookConfigured = razorpay.WebhookConfigured },
            policy = new { refundWindowDays = subscriptions.RefundWindowDays, renewReminderDays = subscriptions.RenewReminderDays },
            plans = plans.Select(p => new
            {
                id = p.Id, code = p.Code, name = p.Name, description = p.Description, price = p.Price, currency = p.Currency,
                periodMonths = p.PeriodMonths, tier = p.Tier, invoiceLimit = p.InvoiceLimit, invoiceLimitPeriod = p.InvoiceLimitPeriod,
                maxUsers = p.MaxUsers,
                features = (p.Features ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(f => f.StartsWith('-') ? new { text = f[1..].Trim(), included = false } : new { text = f, included = true }),
            }),
            entitlement = EntitlementJson(entitlement),
            current = new
            {
                status = state.DisplayStatus,
                subscriptionId = state.Subscription?.Id,
                hasAccess = state.HasAccess,
                onTrial = state.OnTrial,
                trialAvailable = !state.TrialUsed && !state.HasAccess,
                plan = state.CurrentPeriod is { } c ? new { id = c.PlanId, name = c.PlanName } : null,
                periodStart = Utc(state.CurrentPeriod?.PeriodStart),
                periodEnd = Utc(state.CurrentPeriod?.PeriodEnd),
                paidUntil = Utc(state.PaidUntil),
                daysLeft,
                renewDue = state.HasAccess && !state.OnTrial && state.UpcomingPeriod is null && daysLeft <= subscriptions.RenewReminderDays,
                upcoming = state.UpcomingPeriod is { } u
                    ? new { planId = u.PlanId, planName = u.PlanName, periodStart = Utc(u.PeriodStart), periodEnd = Utc(u.PeriodEnd) }
                    : null,
                cancelAtPeriodEnd = state.Subscription?.CancelAtPeriodEnd ?? false,
                cancelRequestedAt = Utc(state.Subscription?.CancelRequestedAt),
                cancelledAt = Utc(state.Subscription?.CancelledAt),
                cancelReason = state.Subscription?.CancelReason,
                refundPreview = new
                {
                    amount = refundPreview.Sum(r => r.Amount),
                    lines = refundPreview.Select(r => new { paymentId = r.Payment.Id, amount = r.Amount, reason = r.Reason }),
                },
            },
            payments = history.Select(p => new
            {
                id = p.Id, subscriptionId = p.SubscriptionId, planName = p.PlanName, purpose = p.Purpose, status = p.Status,
                amount = p.Amount, currency = p.Currency, orderId = p.RazorpayOrderId, paymentId = p.RazorpayPaymentId,
                method = p.Method, periodStart = Utc(p.PeriodStart), periodEnd = Utc(p.PeriodEnd), error = p.ErrorDescription,
                refundId = p.RefundId, refundAmount = p.RefundAmount, refundStatus = p.RefundStatus, refundedAt = Utc(p.RefundedAt),
                createdAt = Utc(p.CreatedAt), paidAt = Utc(p.PaidAt),
                canSync = p.Status is "CREATED" or "FAILED",
                canRetryRefund = p.Status == "PAID" && p.ErrorDescription != null && p.ErrorDescription.StartsWith("Refund failed"),
            }),
        });
    }

    // Lightweight plan summary for the header badge / module locks — any logged-in user.
    [HttpGet("status")]
    [RequireSession]
    public async Task<IActionResult> Status() => Ok(EntitlementJson(await planAccess.GetAsync()));

    [HttpPost("trial")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> StartTrial() => Run(async () =>
    {
        await subscriptions.StartTrialAsync(HttpContext.GetSession()!.UserId);
        return Ok(new { success = true });
    });

    [HttpPost("checkout")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> Checkout([FromBody] SubscriptionCheckoutRequest body) => Run(async () =>
    {
        var session = HttpContext.GetSession()!;
        var order = await subscriptions.CreateCheckoutAsync(body.PlanId, session.UserId);
        return Ok(new
        {
            keyId = order.KeyId, orderId = order.OrderId, amount = order.AmountPaise, currency = order.Currency,
            planName = order.PlanName, purpose = order.Purpose, businessName = order.BusinessName,
            prefill = new { name = session.Name, email = session.Email },
        });
    });

    [HttpPost("confirm")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> Confirm([FromBody] SubscriptionConfirmRequest body) => Run(async () =>
    {
        if (string.IsNullOrWhiteSpace(body.RazorpayOrderId) || string.IsNullOrWhiteSpace(body.RazorpayPaymentId) || string.IsNullOrWhiteSpace(body.RazorpaySignature))
            return BadRequest(new { error = "Payment details are missing." });

        var result = await subscriptions.ConfirmCheckoutAsync(body.RazorpayOrderId, body.RazorpayPaymentId, body.RazorpaySignature, HttpContext.GetSession()!.UserId);
        return Ok(new { success = true, result = ResultName(result) });
    });

    [HttpPost("failed")]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Failed([FromBody] SubscriptionFailedRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.RazorpayOrderId)) return BadRequest(new { error = "Order id is required." });
        await subscriptions.MarkFailedAsync(body.RazorpayOrderId, body.RazorpayPaymentId, body.Description);
        return Ok(new { success = true });
    }

    [HttpPost("orders/{orderId}/sync")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> Sync(string orderId) => Run(async () =>
    {
        var result = await subscriptions.SyncOrderAsync(orderId, HttpContext.GetSession()!.UserId);
        return Ok(new { success = result >= 0, result = result < 0 ? "NOT_PAID" : ResultName(result) });
    });

    [HttpPost("cancel")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> Cancel([FromBody] SubscriptionCancelRequest body) => Run(async () =>
    {
        var userId = HttpContext.GetSession()!.UserId;
        switch (body.Mode?.Trim().ToUpperInvariant())
        {
            case "PERIOD_END":
                await subscriptions.CancelAtPeriodEndAsync(body.Reason, userId);
                return Ok(new { success = true, mode = "PERIOD_END" });
            case "IMMEDIATE":
                var refunds = await subscriptions.CancelNowAsync(body.Reason, userId);
                return Ok(new
                {
                    success = true, mode = "IMMEDIATE",
                    refundedAmount = refunds.Where(r => r.Success).Sum(r => r.Amount),
                    refunds = refunds.Select(r => new { paymentId = r.PaymentId, amount = r.Amount, success = r.Success, refundId = r.RefundId, error = r.Error }),
                });
            default:
                return BadRequest(new { error = "Mode must be PERIOD_END or IMMEDIATE." });
        }
    });

    [HttpPost("resume")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> Resume() => Run(async () =>
    {
        await subscriptions.ResumeAsync(HttpContext.GetSession()!.UserId);
        return Ok(new { success = true });
    });

    [HttpPost("payments/{paymentId:int}/refund")]
    [RequirePermission("SETTINGS", "EDIT")]
    public Task<IActionResult> RetryRefund(int paymentId) => Run(async () =>
    {
        var outcome = await subscriptions.RetryRefundAsync(paymentId, HttpContext.GetSession()!.UserId);
        return outcome.Success ? Ok(new { success = true, refundId = outcome.RefundId }) : StatusCode(502, new { error = outcome.Error });
    });

    // Razorpay → server notification (Dashboard → Webhooks, URL <public-host>/api/subscription/webhook,
    // events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed).
    // Needs a public URL, so it is optional; the checkout callback + "Check status" cover local use.
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        if (!razorpay.WebhookConfigured) return NotFound();

        using var reader = new StreamReader(Request.Body);
        var raw = await reader.ReadToEndAsync();
        if (!razorpay.VerifyWebhookSignature(raw, Request.Headers["X-Razorpay-Signature"].FirstOrDefault()))
            return BadRequest(new { error = "Invalid signature" });

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var eventName = root.GetProperty("event").GetString();
            var payload = root.GetProperty("payload");

            if (eventName is "payment.captured" or "order.paid" or "payment.failed" && payload.TryGetProperty("payment", out var paymentWrap))
            {
                var p = paymentWrap.GetProperty("entity");
                var orderId = p.TryGetProperty("order_id", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null;
                if (orderId is not null)
                {
                    var payment = new RazorpayPayment(
                        p.GetProperty("id").GetString()!, p.GetProperty("status").GetString() ?? "", p.GetProperty("amount").GetInt64(),
                        p.GetProperty("currency").GetString() ?? "INR", orderId,
                        p.TryGetProperty("method", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null,
                        p.TryGetProperty("error_description", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null);

                    if (eventName == "payment.failed") await subscriptions.MarkFailedAsync(orderId, payment.Id, payment.ErrorDescription);
                    else if (payment.Status == "captured") await subscriptions.ApplyGatewayPaymentAsync(orderId, payment, null, null);
                }
            }
            else if (eventName is "refund.processed" or "refund.failed" && payload.TryGetProperty("refund", out var refundWrap))
            {
                var r = refundWrap.GetProperty("entity");
                await subscriptions.UpdateRefundStatusAsync(r.GetProperty("id").GetString()!, r.GetProperty("status").GetString() ?? eventName);
            }
        }
        catch (SubscriptionException ex) when (ex.StatusCode == 404)
        {
            // Not one of our subscription orders (e.g. another integration on the same account).
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or SubscriptionException)
        {
            logger.LogWarning(ex, "Razorpay webhook could not be processed");
        }
        return Ok(new { received = true });
    }

    private async Task<IActionResult> Run(Func<Task<IActionResult>> action)
    {
        try { return await action(); }
        catch (SubscriptionException ex) { return StatusCode(ex.StatusCode, new { error = ex.Message }); }
    }

    private static string ResultName(int result) => result switch
    {
        0 => "ACTIVATED", 1 => "ALREADY_RECORDED", 3 => "REFUNDED_AFTER_CANCEL", _ => "UNKNOWN",
    };

    private static object EntitlementJson(PlanEntitlement e) => new
    {
        status = e.Status, active = e.Active, planId = e.PlanId, planName = e.PlanName, tier = e.Tier,
        paidUntil = Utc(e.PaidUntil), cancelAtPeriodEnd = e.CancelAtPeriodEnd,
        invoiceLimit = e.InvoiceLimit, invoiceLimitPeriod = e.InvoiceLimitPeriod, invoicesUsed = e.InvoicesUsed, invoicesLeft = e.InvoicesLeft,
        maxUsers = e.MaxUsers, activeUsers = e.ActiveUsers, lockedFeatures = e.LockedFeatures, trialAvailable = e.TrialAvailable,
    };

    private static DateTime? Utc(DateTime? value) => value is null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
}
