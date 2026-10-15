namespace BillingErp.Api.Data.Entities;

// Cash-in-hand and bank accounts. Balances are never stored — they're derived (sp_CashBank_*)
// from OpeningBalance + every payment/expense/refund routed to the account + manual transfers.
// Routing rule: method CASH → the CASH account; UPI/CARD/BANK → the default BANK account.
public class MoneyAccount
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = "BANK"; // CASH | BANK
    public string? BankName { get; set; }
    public string? AccountNumber { get; set; }
    public string? Ifsc { get; set; }
    public decimal OpeningBalance { get; set; }
    public bool IsDefault { get; set; } // default BANK account for UPI/CARD/BANK receipts & payments
    public bool Status { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Manual money movements: cash ↔ bank transfers and cash/bank adjustments.
// TRANSFER: From → To. ADJUST_IN: money added to To. ADJUST_OUT: money removed from From.
public class CashBankTransaction
{
    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string Type { get; set; } = "TRANSFER"; // TRANSFER | ADJUST_IN | ADJUST_OUT
    public int? FromAccountId { get; set; }
    public MoneyAccount? FromAccount { get; set; }
    public int? ToAccountId { get; set; }
    public MoneyAccount? ToAccount { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
