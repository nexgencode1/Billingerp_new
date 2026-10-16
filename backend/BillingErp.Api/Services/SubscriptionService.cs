using System.Data;
using BillingErp.Api.Data;
using Dapper;

namespace BillingErp.Api.Services;

public class SubscriptionPlanRow
{
    public int Id { get; init; }
    public string Code { get; init; } = "";
    public string Name { get; init; } = "";
    public string? Description { get; init; }
    public decimal Price { get; init; }
    public string Currency { get; init; } = "INR";
    public int PeriodMonths { get; init; }
    public string? Features { get; init; }
    public string Tier { get; init; } = "";
    public int? InvoiceLimit { get; init; }
    public string? InvoiceLimitPeriod { get; init; }
    public int? MaxUsers { get; init; }
    public string? LockedFeatures { get; init; }
    public bool IsActive { get; init; }
    public int SortOrder { get; init; }
}

public class SubscriptionRow
{
    public int Id { get; init; }
    public string Status { get; init; } = "";
    public bool CancelAtPeriodEnd { get; init; }
    public DateTime? CancelRequestedAt { get; init; }
    public DateTime? CancelledAt { get; init; }
    public string? CancelReason { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class SubscriptionPaymentRow
{
    public int Id { get; init; }
    public int SubscriptionId { get; init; }
    public int PlanId { get; init; }
    public string PlanName { get; init; } = "";
    public int PeriodMonths { get; init; }
    public string Tier { get; init; } = "";
    public string Purpose { get; init; } = "";
    public string Status { get; init; } = "";
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "INR";
    public string RazorpayOrderId { get; init; } = "";
    public string? RazorpayPaymentId { get; init; }
    public string? Method { get; init; }
    public DateTime? PeriodStart { get; init; }
    public DateTime? PeriodEnd { get; init; }
    public string? ErrorDescription { get; init; }
    public string? RefundId { get; init; }
    public decimal? RefundAmount { get; init; }
    public string? RefundStatus { get; init; }
    public DateTime? RefundedAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? PaidAt { get; init; }
}

// Derived view of the latest subscription. DisplayStatus:
//   NONE | PENDING (no successful payment yet) | ACTIVE | CANCELS_AT_PERIOD_END |
//   EXPIRED (paid period over, not renewed) | ENDED (ran out after cancel-at-period-end) | CANCELLED
public record SubscriptionState(
    SubscriptionRow? Subscription, string DisplayStatus, SubscriptionPaymentRow? CurrentPeriod,
    SubscriptionPaymentRow? UpcomingPeriod, DateTime? PaidUntil, List<SubscriptionPaymentRow> Payments)
{
    // A subscription that new payments attach to (renew / change plan / finish a pending checkout).
    public bool IsLive => DisplayStatus is "PENDING" or "ACTIVE" or "CANCELS_AT_PERIOD_END";
    public bool HasAccess => DisplayStatus is "ACTIVE" or "CANCELS_AT_PERIOD_END";
    public bool OnTrial => HasAccess && CurrentPeriod?.Tier == "TRIAL";
    public bool TrialUsed => Payments.Any(p => p.Tier == "TRIAL" && p.Status == "PAID");
}

public record RefundLine(SubscriptionPaymentRow Payment, decimal Amount, string Reason);
public record RefundOutcome(int PaymentId, decimal Amount, bool Success, string? RefundId, string? Error);
public record CheckoutOrder(string OrderId, long AmountPaise, string Currency, string KeyId, string PlanName, string Purpose, string BusinessName);

public class SubscriptionException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

// Business rules for the software subscription (paid via Razorpay Checkout, one Order per period):
// - Periods are contiguous and come only from PAID payments (sp_SubscriptionPayment_MarkPaid).
// - Free trial (tier TRIAL): once per business, no payment, no end date — it ends when its bill
//   allowance is used (PlanAccessService) or a paid plan replaces it immediately (UPGRADE).
// - While active you may prepay ONE next period (same plan = RENEWAL, other plan = CHANGE, which
//   takes effect when the current period ends). No proration.
// - Cancel at period end: access continues until the paid-until date, no refund, can be resumed.
// - Cancel immediately: access ends now; not-yet-started prepaid periods are refunded in full, and
//   the current period is refunded in full only if it was paid within Subscription:RefundWindowDays.
public class SubscriptionService(
    SqlConnectionFactory connectionFactory, RazorpayService razorpay, AuditService audit, IConfiguration config,
    ILogger<SubscriptionService> logger)
{
    public int RefundWindowDays => Math.Max(0, config.GetValue("Subscription:RefundWindowDays", 7));
    public int RenewReminderDays => Math.Max(0, config.GetValue("Subscription:RenewReminderDays", 7));

    public async Task<List<SubscriptionPlanRow>> PlansAsync(bool activeOnly = true)
    {
        using var connection = connectionFactory.Create();
        return (await connection.QueryAsync<SubscriptionPlanRow>("dbo.sp_SubscriptionPlan_List",
            new { ActiveOnly = activeOnly }, commandType: CommandType.StoredProcedure)).ToList();
    }

    public async Task<List<SubscriptionPaymentRow>> PaymentHistoryAsync(int top = 50)
    {
        using var connection = connectionFactory.Create();
        return (await connection.QueryAsync<SubscriptionPaymentRow>("dbo.sp_SubscriptionPayment_List",
            new { SubscriptionId = (int?)null, Top = top }, commandType: CommandType.StoredProcedure)).ToList();
    }

    public async Task<SubscriptionState> StateAsync()
    {
        using var connection = connectionFactory.Create();
        var subscription = await connection.QueryFirstOrDefaultAsync<SubscriptionRow>("dbo.sp_Subscription_GetLatest",
            commandType: CommandType.StoredProcedure);
        if (subscription is null) return new SubscriptionState(null, "NONE", null, null, null, []);

        var payments = (await connection.QueryAsync<SubscriptionPaymentRow>("dbo.sp_SubscriptionPayment_List",
            new { SubscriptionId = subscription.Id, Top = 500 }, commandType: CommandType.StoredProcedure)).ToList();
        return Derive(subscription, payments, DateTime.UtcNow);
    }

    public static SubscriptionState Derive(SubscriptionRow subscription, List<SubscriptionPaymentRow> payments, DateTime now)
    {
        var paid = payments.Where(p => p.Status == "PAID" && p.PeriodStart is not null && p.PeriodEnd is not null).ToList();
        var paidUntil = paid.Count == 0 ? (DateTime?)null : paid.Max(p => p.PeriodEnd!.Value);
        var current = paid.FirstOrDefault(p => p.PeriodStart <= now && now < p.PeriodEnd);
        var upcoming = paid.Where(p => p.PeriodStart > now).OrderBy(p => p.PeriodStart).FirstOrDefault();

        var status = subscription.Status switch
        {
            "CANCELLED" => "CANCELLED",
            "PENDING" => "PENDING",
            _ when paidUntil > now => subscription.CancelAtPeriodEnd ? "CANCELS_AT_PERIOD_END" : "ACTIVE",
            _ => subscription.CancelAtPeriodEnd ? "ENDED" : "EXPIRED",
        };
        return new SubscriptionState(subscription, status, current, upcoming, paidUntil, payments);
    }

    // What an immediate cancel would refund right now.
    public List<RefundLine> RefundPreview(SubscriptionState state, DateTime now)
    {
        if (!state.HasAccess) return [];
        var lines = new List<RefundLine>();
        foreach (var payment in state.Payments.Where(p => p.Status == "PAID" && p.RazorpayPaymentId is not null))
        {
            if (payment.PeriodStart > now)
                lines.Add(new RefundLine(payment, payment.Amount, "Prepaid period not started yet"));
            else if (payment == state.CurrentPeriod && payment.PaidAt is not null && payment.PaidAt.Value.AddDays(RefundWindowDays) >= now)
                lines.Add(new RefundLine(payment, payment.Amount, $"Paid within the {RefundWindowDays}-day refund window"));
        }
        return lines;
    }

    public async Task<CheckoutOrder> CreateCheckoutAsync(int planId, int userId)
    {
        if (!razorpay.IsConfigured) throw new SubscriptionException("Online payment is not configured on the server.", 503);

        var plan = (await PlansAsync()).FirstOrDefault(p => p.Id == planId)
            ?? throw new SubscriptionException("This plan is not available.");
        if (plan.Tier == "TRIAL") throw new SubscriptionException("Start the free trial from the Free Trial card.");
        if (plan.Price <= 0) throw new SubscriptionException("This plan has no price set.");

        var state = await StateAsync();
        int? subscriptionId = null;
        var purpose = "NEW";
        if (state.IsLive)
        {
            subscriptionId = state.Subscription!.Id;
            if (state.OnTrial)
            {
                purpose = "UPGRADE"; // replaces the trial right away
            }
            else if (state.HasAccess)
            {
                if (state.UpcomingPeriod is not null)
                    throw new SubscriptionException($"Already renewed until {state.PaidUntil:dd MMM yyyy}. You can renew again once the next period starts.");
                purpose = state.CurrentPeriod?.PlanId == plan.Id ? "RENEWAL" : "CHANGE";
            }
        }

        var amountPaise = RazorpayService.ToPaise(plan.Price);
        var receipt = $"SUB-{Guid.NewGuid():N}"[..20];
        string orderId;
        try
        {
            orderId = await razorpay.CreateOrderAsync(amountPaise, plan.Currency, receipt,
                new() { ["plan"] = plan.Code, ["purpose"] = purpose });
        }
        catch (RazorpayException ex)
        {
            throw new SubscriptionException(ex.Message, 502);
        }

        using var connection = connectionFactory.Create();
        var parameters = new DynamicParameters(new
        {
            SubscriptionId = subscriptionId, PlanId = plan.Id, Purpose = purpose, Amount = plan.Price,
            plan.Currency, RazorpayOrderId = orderId, UserId = userId,
        });
        parameters.Add("OutSubscriptionId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("OutPaymentId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_SubscriptionPayment_Create", parameters, commandType: CommandType.StoredProcedure);

        var business = await connection.QueryFirstOrDefaultAsync<string>("SELECT TOP 1 Name FROM dbo.Businesses ORDER BY Id");
        return new CheckoutOrder(orderId, amountPaise, plan.Currency, razorpay.KeyId!, plan.Name, purpose, business ?? "Billing ERP");
    }

    // Checkout success callback from the browser: the signature proves Razorpay produced this
    // order/payment pair; the payment is then re-fetched server-side to check amount + capture.
    public async Task<int> ConfirmCheckoutAsync(string orderId, string paymentId, string signature, int? userId)
    {
        if (!razorpay.VerifyCheckoutSignature(orderId, paymentId, signature))
            throw new SubscriptionException("Payment signature is invalid.");

        RazorpayPayment payment;
        try { payment = await razorpay.FetchPaymentAsync(paymentId); }
        catch (RazorpayException ex) { throw new SubscriptionException(ex.Message, 502); }
        if (payment.OrderId != orderId) throw new SubscriptionException("Payment does not belong to this order.");

        return await ApplyGatewayPaymentAsync(orderId, payment, signature, userId);
    }

    // Recovery when the browser closed before the success callback (or no webhook in local dev):
    // asks Razorpay for the order's payments and applies a captured one.
    public async Task<int> SyncOrderAsync(string orderId, int? userId)
    {
        List<RazorpayPayment> payments;
        try { payments = await razorpay.FetchOrderPaymentsAsync(orderId); }
        catch (RazorpayException ex) { throw new SubscriptionException(ex.Message, 502); }

        var success = payments.FirstOrDefault(p => p.Status == "captured") ?? payments.FirstOrDefault(p => p.Status == "authorized");
        if (success is null)
        {
            var failed = payments.LastOrDefault(p => p.Status == "failed");
            if (failed is not null) await MarkFailedAsync(orderId, failed.Id, failed.ErrorDescription ?? "Payment failed");
            return -1;
        }
        return await ApplyGatewayPaymentAsync(orderId, success, null, userId);
    }

    // Shared by checkout confirm, sync and webhook. Returns sp_SubscriptionPayment_MarkPaid's @Result.
    public async Task<int> ApplyGatewayPaymentAsync(string orderId, RazorpayPayment payment, string? signature, int? userId)
    {
        using var connection = connectionFactory.Create();
        var stored = await connection.QueryFirstOrDefaultAsync<SubscriptionPaymentRow>(
            "dbo.sp_SubscriptionPayment_GetByOrderId", new { RazorpayOrderId = orderId }, commandType: CommandType.StoredProcedure)
            ?? throw new SubscriptionException("Unknown order.", 404);
        if (stored.Status is "PAID" or "REFUNDED") return 1;

        if (payment.AmountPaise != RazorpayService.ToPaise(stored.Amount) || !string.Equals(payment.Currency, stored.Currency, StringComparison.OrdinalIgnoreCase))
            throw new SubscriptionException("Paid amount does not match the plan price.");

        if (payment.Status == "authorized")
        {
            try { payment = await razorpay.CapturePaymentAsync(payment.Id, payment.AmountPaise, payment.Currency); }
            catch (RazorpayException ex) { throw new SubscriptionException(ex.Message, 502); }
        }
        if (payment.Status != "captured") throw new SubscriptionException($"Payment is {payment.Status}, not completed.");

        var parameters = new DynamicParameters(new
        {
            RazorpayOrderId = orderId, RazorpayPaymentId = payment.Id, Signature = signature, payment.Method,
        });
        parameters.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("PeriodStart", dbType: DbType.DateTime2, direction: ParameterDirection.Output);
        parameters.Add("PeriodEnd", dbType: DbType.DateTime2, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_SubscriptionPayment_MarkPaid", parameters, commandType: CommandType.StoredProcedure);
        var result = parameters.Get<int>("Result");

        if (result == 0)
        {
            await audit.LogAsync(userId, "CREATE", "SETTINGS", stored.SubscriptionId,
                $"Subscription payment {payment.Id} received (₹{stored.Amount:0.00})");
        }
        else if (result == 3)
        {
            // Paid after the subscription was cancelled (e.g. checkout left open) — give it back.
            var refund = await RefundPaymentAsync(stored.Id, payment.Id, stored.Amount, "Paid after subscription was cancelled");
            logger.LogWarning("Subscription order {OrderId} paid after cancel; refund success={Success}", orderId, refund.Success);
        }
        return result;
    }

    public async Task StartTrialAsync(int userId)
    {
        var state = await StateAsync();
        if (state.HasAccess)
            throw new SubscriptionException(state.OnTrial ? "Your free trial is already running." : "You already have an active plan.");

        using var connection = connectionFactory.Create();
        var parameters = new DynamicParameters(new { UserId = userId, Reference = $"TRIAL-{Guid.NewGuid():N}"[..30] });
        parameters.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        parameters.Add("OutSubscriptionId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Subscription_StartTrial", parameters, commandType: CommandType.StoredProcedure);
        switch (parameters.Get<int>("Result"))
        {
            case 1: throw new SubscriptionException("The free trial has already been used. Please choose a plan.");
            case 2: throw new SubscriptionException("The free trial is not available.", 404);
        }
        await audit.LogAsync(userId, "CREATE", "SETTINGS", parameters.Get<int?>("OutSubscriptionId"), "Free trial started");
    }

    public async Task MarkFailedAsync(string orderId, string? paymentId, string? error)
    {
        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_SubscriptionPayment_MarkFailed",
            new { RazorpayOrderId = orderId, RazorpayPaymentId = paymentId, Error = Truncate(error, 500) },
            commandType: CommandType.StoredProcedure);
    }

    public async Task CancelAtPeriodEndAsync(string? reason, int userId)
    {
        var state = await StateAsync();
        if (state.OnTrial) throw new SubscriptionException("The free trial doesn't need cancelling — it simply ends.");
        if (state.DisplayStatus != "ACTIVE") throw new SubscriptionException("There is no active subscription to cancel.");

        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_Subscription_SetCancelAtPeriodEnd",
            new { SubscriptionId = state.Subscription!.Id, Cancel = true, Reason = Truncate(reason, 500) },
            commandType: CommandType.StoredProcedure);
        await audit.LogAsync(userId, "EDIT", "SETTINGS", state.Subscription.Id, $"Subscription set to cancel on {state.PaidUntil:dd MMM yyyy}");
    }

    public async Task ResumeAsync(int userId)
    {
        var state = await StateAsync();
        if (state.DisplayStatus != "CANCELS_AT_PERIOD_END") throw new SubscriptionException("Nothing to resume.");

        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_Subscription_SetCancelAtPeriodEnd",
            new { SubscriptionId = state.Subscription!.Id, Cancel = false, Reason = (string?)null },
            commandType: CommandType.StoredProcedure);
        await audit.LogAsync(userId, "EDIT", "SETTINGS", state.Subscription.Id, "Subscription cancellation withdrawn");
    }

    public async Task<List<RefundOutcome>> CancelNowAsync(string? reason, int userId)
    {
        var state = await StateAsync();
        if (state.Subscription is null || !state.IsLive) throw new SubscriptionException("There is no subscription to cancel.");
        if (state.OnTrial) throw new SubscriptionException("The free trial doesn't need cancelling — it simply ends.");

        var refunds = RefundPreview(state, DateTime.UtcNow);
        using (var connection = connectionFactory.Create())
        {
            await connection.ExecuteAsync("dbo.sp_Subscription_CancelNow",
                new { SubscriptionId = state.Subscription.Id, Reason = Truncate(reason, 500) },
                commandType: CommandType.StoredProcedure);
        }

        var outcomes = new List<RefundOutcome>();
        foreach (var line in refunds)
            outcomes.Add(await RefundPaymentAsync(line.Payment.Id, line.Payment.RazorpayPaymentId!, line.Amount, line.Reason));

        var refunded = outcomes.Where(o => o.Success).Sum(o => o.Amount);
        await audit.LogAsync(userId, "DELETE", "SETTINGS", state.Subscription.Id,
            refunded > 0 ? $"Subscription cancelled, ₹{refunded:0.00} refunded" : "Subscription cancelled");
        return outcomes;
    }

    // Retry for a refund that failed during cancel (the payment keeps its ErrorDescription).
    public async Task<RefundOutcome> RetryRefundAsync(int paymentId, int userId)
    {
        var history = await PaymentHistoryAsync(500);
        var payment = history.FirstOrDefault(p => p.Id == paymentId) ?? throw new SubscriptionException("Payment not found.", 404);
        var state = await StateAsync();
        var cancelled = state.Subscription?.Id != payment.SubscriptionId || state.DisplayStatus == "CANCELLED";
        if (payment.Status != "PAID" || payment.RazorpayPaymentId is null || payment.ErrorDescription is null || !cancelled)
            throw new SubscriptionException("This payment has no pending refund.");

        var outcome = await RefundPaymentAsync(payment.Id, payment.RazorpayPaymentId, payment.Amount, "Refund retry");
        if (outcome.Success) await audit.LogAsync(userId, "EDIT", "SETTINGS", payment.SubscriptionId, $"Subscription refund ₹{payment.Amount:0.00} issued");
        return outcome;
    }

    public async Task UpdateRefundStatusAsync(string refundId, string status)
    {
        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_SubscriptionPayment_UpdateRefundStatus",
            new { RefundId = refundId, RefundStatus = status }, commandType: CommandType.StoredProcedure);
    }

    private async Task<RefundOutcome> RefundPaymentAsync(int paymentId, string razorpayPaymentId, decimal amount, string reason)
    {
        string? refundId = null, refundStatus = null, error = null;
        try
        {
            var refund = await razorpay.RefundAsync(razorpayPaymentId, RazorpayService.ToPaise(amount), new() { ["reason"] = reason });
            refundId = refund.Id;
            refundStatus = refund.Status;
        }
        catch (Exception ex) when (ex is RazorpayException or HttpRequestException or TaskCanceledException)
        {
            error = $"Refund failed: {ex.Message}";
            logger.LogWarning(ex, "Subscription refund failed for payment {PaymentId}", razorpayPaymentId);
        }

        using var connection = connectionFactory.Create();
        await connection.ExecuteAsync("dbo.sp_SubscriptionPayment_SetRefund",
            new { PaymentId = paymentId, RefundId = refundId, RefundAmount = refundId is null ? (decimal?)null : amount, RefundStatus = refundStatus, Error = Truncate(error, 500) },
            commandType: CommandType.StoredProcedure);
        return new RefundOutcome(paymentId, amount, refundId is not null, refundId, error);
    }

    private static string? Truncate(string? value, int max)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim().Length <= max ? value.Trim() : value.Trim()[..max];
}
