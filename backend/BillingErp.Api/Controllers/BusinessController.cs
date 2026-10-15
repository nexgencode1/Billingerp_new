using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Dtos;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/business/route.ts.
[ApiController]
[Route("api/business")]
public class BusinessController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private record BusinessRow(
        int Id, string Name, string? Logo, string? Address, string? Phone, string? Email, string? Website,
        string? Gstin, string? Pan, string? State, string? Pincode, string? BankName, string? AccountNumber,
        string? Ifsc, string? UpiId, string InvoicePrefix, string PurchasePrefix, string PaymentPrefix,
        string ExpensePrefix, string SaleReturnPrefix, string PurchaseReturnPrefix, string ProductionPrefix,
        int SaleCounter, int PurchaseCounter, int PaymentCounter, int ExpenseCounter, int SaleReturnCounter,
        int PurchaseReturnCounter, int ProductionCounter, string DateFormat, string Currency, int DecimalPlaces,
        bool ShowLogo, bool ShowGst, bool ShowHsn, bool ShowSignature, bool ShowTerms, string? TermsText,
        DateTime CreatedAt, DateTime UpdatedAt, string EstimatePrefix, string SaleOrderPrefix, string ChallanPrefix,
        int EstimateCounter, int SaleOrderCounter, int ChallanCounter);

    [HttpGet]
    [RequireSession]
    public async Task<IActionResult> Get()
    {
        using var connection = connectionFactory.Create();
        var business = await connection.QuerySingleOrDefaultAsync<BusinessRow>("dbo.sp_Business_Get", commandType: CommandType.StoredProcedure);
        return Ok(business);
    }

    [HttpPatch]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Update([FromBody] BusinessUpdateRequest? body)
    {
        if (body is null) return BadRequest(new { error = "Invalid input" });

        var session = HttpContext.GetSession()!;
        using var connection = connectionFactory.Create();

        var updated = await connection.QuerySingleAsync<BusinessRow>("dbo.sp_Business_Update", new
        {
            body.Name, body.Logo, body.Address, body.Phone, body.Email, body.Website, body.Gstin, body.Pan,
            body.State, body.Pincode, body.BankName, body.AccountNumber, body.Ifsc, body.UpiId,
            body.InvoicePrefix, body.PurchasePrefix, body.PaymentPrefix, body.ExpensePrefix,
            body.SaleReturnPrefix, body.PurchaseReturnPrefix, body.EstimatePrefix, body.SaleOrderPrefix, body.ChallanPrefix, body.DateFormat, body.Currency, body.DecimalPlaces,
            ShowLogoProvided = body.ShowLogo.HasValue, ShowLogo = body.ShowLogo ?? false,
            ShowGstProvided = body.ShowGst.HasValue, ShowGst = body.ShowGst ?? false,
            ShowHsnProvided = body.ShowHsn.HasValue, ShowHsn = body.ShowHsn ?? false,
            ShowSignatureProvided = body.ShowSignature.HasValue, ShowSignature = body.ShowSignature ?? false,
            ShowTermsProvided = body.ShowTerms.HasValue, ShowTerms = body.ShowTerms ?? false,
            TermsTextProvided = body.TermsText is not null, body.TermsText,
        }, commandType: CommandType.StoredProcedure);

        await audit.LogAsync(session.UserId, "UPDATE", "SETTINGS", updated.Id, "Business Profile");

        return Ok(updated);
    }
}
