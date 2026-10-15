using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record MoneyAccountSaveRequest(string? Name, string? Kind, string? BankName, string? AccountNumber, string? Ifsc,
    decimal? OpeningBalance, bool? IsDefault, bool? Status);

public record CashBankTransactionRequest(string? Type, int? FromAccountId, int? ToAccountId, decimal Amount, DateTime? Date, string? Note);

// Cash in hand + bank accounts. Balances are derived (fn_CashBank_Movements), never stored.
[ApiController]
[Route("api/cash-bank")]
public class CashBankController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record AccountRow(int Id, string Name, string Kind, string? BankName, string? AccountNumber, string? Ifsc,
        decimal OpeningBalance, bool IsDefault, bool Status, DateTime CreatedAt, decimal CurrentBalance, decimal TotalIn, decimal TotalOut);

    private record LedgerSummaryRow(decimal OpeningBalance, decimal TotalIn, decimal TotalOut, decimal ClosingBalance);

    private record LedgerRow(DateTime TxnDate, string Source, int RefId, string RefNumber, string? PartyName, string Description,
        decimal AmountIn, decimal AmountOut, decimal RunningBalance);

    [HttpGet("accounts")]
    [RequirePermission("PAYMENTS", "VIEW")]
    public async Task<IActionResult> Accounts()
    {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<AccountRow>("dbo.sp_MoneyAccount_List", commandType: CommandType.StoredProcedure);
        return Ok(rows.Select(r => new
        {
            id = r.Id, name = r.Name, kind = r.Kind, bankName = r.BankName, accountNumber = r.AccountNumber, ifsc = r.Ifsc,
            openingBalance = r.OpeningBalance, isDefault = r.IsDefault, status = r.Status, createdAt = r.CreatedAt,
            currentBalance = r.CurrentBalance, totalIn = r.TotalIn, totalOut = r.TotalOut,
        }));
    }

    [HttpPost("accounts")]
    [RequirePermission("PAYMENTS", "EDIT")]
    public Task<IActionResult> CreateAccount([FromBody] MoneyAccountSaveRequest? body) => SaveAccount(null, body);

    [HttpPut("accounts/{id:int}")]
    [RequirePermission("PAYMENTS", "EDIT")]
    public Task<IActionResult> UpdateAccount(int id, [FromBody] MoneyAccountSaveRequest? body) => SaveAccount(id, body);

    private async Task<IActionResult> SaveAccount(int? id, MoneyAccountSaveRequest? body)
    {
        var name = body?.Name?.Trim();
        var kind = body?.Kind?.Trim().ToUpperInvariant() ?? "BANK";
        if (string.IsNullOrEmpty(name)) return BadRequest(new { error = "Account name is required" });
        if (kind is not ("CASH" or "BANK")) return BadRequest(new { error = "Kind must be CASH or BANK" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("AccountId", id);
        p.Add("Name", name);
        p.Add("Kind", kind);
        p.Add("BankName", Blank(body!.BankName));
        p.Add("AccountNumber", Blank(body.AccountNumber));
        p.Add("Ifsc", Blank(body.Ifsc)?.ToUpperInvariant());
        p.Add("OpeningBalance", body.OpeningBalance ?? 0);
        p.Add("IsDefault", body.IsDefault ?? false);
        p.Add("Status", body.Status ?? true);
        p.Add("SavedId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_MoneyAccount_Save", p, commandType: CommandType.StoredProcedure);

        switch (p.Get<int>("Result"))
        {
            case 1: return NotFound(new { error = "Account not found" });
            case 2: return BadRequest(new { error = "There is already a Cash in Hand account" });
        }
        var savedId = p.Get<int>("SavedId");
        await audit.LogAsync(session.UserId, id is null ? "CREATE" : "UPDATE", "PAYMENTS", savedId, $"Account {name}");
        return id is null ? StatusCode(201, new { id = savedId }) : Ok(new { id = savedId });
    }

    [HttpGet("accounts/{id:int}/ledger")]
    [RequirePermission("PAYMENTS", "VIEW")]
    public async Task<IActionResult> Ledger(int id, [FromQuery] string? from, [FromQuery] string? to)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_CashBank_Ledger", new { AccountId = id, From = f, To = t }, commandType: CommandType.StoredProcedure);
        var s = await multi.ReadSingleAsync<LedgerSummaryRow>();
        var rows = (await multi.ReadAsync<LedgerRow>()).ToList();

        return Ok(new
        {
            summary = new { openingBalance = s.OpeningBalance, totalIn = s.TotalIn, totalOut = s.TotalOut, closingBalance = s.ClosingBalance },
            rows = rows.Select((r, i) => new
            {
                key = $"{r.Source}-{r.RefId}-{i}", date = r.TxnDate, source = r.Source, refId = r.RefId, refNumber = r.RefNumber,
                partyName = r.PartyName, description = r.Description, amountIn = r.AmountIn, amountOut = r.AmountOut,
                runningBalance = r.RunningBalance,
            }),
        });
    }

    [HttpPost("transactions")]
    [RequirePermission("PAYMENTS", "EDIT")]
    public async Task<IActionResult> CreateTransaction([FromBody] CashBankTransactionRequest? body)
    {
        var type = body?.Type?.Trim().ToUpperInvariant();
        if (body is null || type is not ("TRANSFER" or "ADJUST_IN" or "ADJUST_OUT"))
            return BadRequest(new { error = "Type must be TRANSFER, ADJUST_IN or ADJUST_OUT" });
        if (body.Amount <= 0) return BadRequest(new { error = "Amount must be greater than 0" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("Type", type);
        p.Add("FromAccountId", type == "ADJUST_IN" ? null : body.FromAccountId);
        p.Add("ToAccountId", type == "ADJUST_OUT" ? null : body.ToAccountId);
        p.Add("Amount", Math.Round(body.Amount, 2));
        p.Add("Date", body.Date ?? DateTime.Now);
        p.Add("Note", Blank(body.Note));
        p.Add("CreatedById", session.UserId);
        p.Add("TransactionId", dbType: DbType.Int32, direction: ParameterDirection.Output);
        p.Add("Result", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_CashBank_TransactionCreate", p, commandType: CommandType.StoredProcedure);

        if (p.Get<int>("Result") != 0)
            return BadRequest(new { error = "Choose valid, different, active accounts for this entry" });

        var txnId = p.Get<int>("TransactionId");
        await audit.LogAsync(session.UserId, "CREATE", "PAYMENTS", txnId, $"Cash/Bank {type}");
        return StatusCode(201, new { id = txnId });
    }

    private static string? Blank(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
