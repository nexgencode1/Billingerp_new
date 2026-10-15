namespace BillingErp.Api.Data.Entities;

// Customer self-service portal login (one per customer). The customer signs in with their mobile
// number + a password the business sets (bcrypt-hashed, never stored plain). Repeated failures
// lock the account for a while (FailedAttempts / LockedUntil).
public class CustomerPortalAccount
{
    public int CustomerId { get; set; } // primary key + FK
    public Customer Customer { get; set; } = null!;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public int FailedAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
