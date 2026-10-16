namespace BillingErp.Api.Data.Entities;

// Software subscription of this business (paid through Razorpay Checkout, one Razorpay Order per
// billing period). The current plan / paid-until date are DERIVED from the PAID SubscriptionPayments
// (each one covers PeriodStart..PeriodEnd), never stored on the Subscription row itself.
public class SubscriptionPlan
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "INR";
    public int PeriodMonths { get; set; } = 1; // 0 = no time limit (the free trial ends by bill count)
    public string? Features { get; set; } // one feature per line; a leading "-" marks "not included"
    public string Tier { get; set; } = "PRO"; // TRIAL | BASIC | PRO
    public int? InvoiceLimit { get; set; } // null = unlimited
    public string? InvoiceLimitPeriod { get; set; } // TOTAL (whole plan period) | MONTH (calendar month)
    public int? MaxUsers { get; set; } // null = unlimited active users
    public string? LockedFeatures { get; set; } // comma list of PlanFeatures keys NOT in this plan
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Subscription
{
    public int Id { get; set; }
    public string Status { get; set; } = "PENDING"; // PENDING | ACTIVE | CANCELLED
    public bool CancelAtPeriodEnd { get; set; }
    public DateTime? CancelRequestedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancelReason { get; set; }
    public int? CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<SubscriptionPayment> Payments { get; set; } = [];
}

public class SubscriptionPayment
{
    public int Id { get; set; }
    public int SubscriptionId { get; set; }
    public Subscription Subscription { get; set; } = null!;
    public int PlanId { get; set; }
    public SubscriptionPlan Plan { get; set; } = null!;
    public string Purpose { get; set; } = "NEW"; // NEW | RENEWAL | CHANGE
    public string Status { get; set; } = "CREATED"; // CREATED | PAID | FAILED | REFUNDED
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "INR";
    public string RazorpayOrderId { get; set; } = string.Empty;
    public string? RazorpayPaymentId { get; set; }
    public string? RazorpaySignature { get; set; }
    public string? Method { get; set; }
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public string? ErrorDescription { get; set; }
    public string? RefundId { get; set; }
    public decimal? RefundAmount { get; set; }
    public string? RefundStatus { get; set; }
    public DateTime? RefundedAt { get; set; }
    public int? CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
}
