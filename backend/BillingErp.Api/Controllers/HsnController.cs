using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record HsnImportRequest(List<Dictionary<string, JsonElement>>? Rows);

// HSN / SAC master (imported from the official public list) + suggestions for the product form.
// Rates in suggestions are only as current as the imported file. // VERIFY: official rule
[ApiController]
[Route("api/hsn")]
public partial class HsnController(SqlConnectionFactory connectionFactory, AuditService audit) : ControllerBase
{
    private const int MaxImportRows = 50_000;

    private record SuggestionRow(string Code, string Description, decimal? GstRate, string Source, int UsageCount);

    [GeneratedRegex(@"^\d{2,8}$")]
    private static partial Regex CodePattern();

    // Case-insensitive column lookup; numbers and strings both come back as trimmed text.
    private static string Cell(Dictionary<string, JsonElement> row, string column)
    {
        var entry = row.FirstOrDefault(kv => string.Equals(kv.Key.Trim(), column, StringComparison.OrdinalIgnoreCase));
        return entry.Key is null ? "" : entry.Value.ValueKind switch
        {
            JsonValueKind.String => entry.Value.GetString()?.Trim() ?? "",
            JsonValueKind.Number => entry.Value.GetRawText(),
            _ => "",
        };
    }

    [HttpGet("suggest")]
    [RequirePermission("PRODUCTS", "VIEW")]
    public async Task<IActionResult> Suggest([FromQuery] string? q)
    {
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Hsn_Suggest", new { Query = q ?? "", Max = 8 }, commandType: CommandType.StoredProcedure);
        var history = (await multi.ReadAsync<SuggestionRow>()).ToList();
        var master = multi.IsConsumed ? [] : (await multi.ReadAsync<SuggestionRow>()).ToList();
        var masterCount = multi.IsConsumed ? 0 : await multi.ReadSingleAsync<int>();

        static object Json(SuggestionRow r) => new { code = r.Code, description = r.Description, gstRate = r.GstRate, source = r.Source, usageCount = r.UsageCount };
        return Ok(new { history = history.Select(Json), master = master.Select(Json), masterCount });
    }

    [HttpPost("import")]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Import([FromBody] HsnImportRequest? body)
    {
        var rows = body?.Rows ?? [];
        if (rows.Count == 0) return BadRequest(new { error = "No rows to import" });
        if (rows.Count > MaxImportRows) return BadRequest(new { error = $"At most {MaxImportRows:N0} rows per import" });

        var errors = new List<object>();
        var clean = new List<object>();
        for (var i = 0; i < rows.Count; i++)
        {
            var rawCode = Cell(rows[i], "Code");
            var code = rawCode.Replace(" ", "").Replace(".", "");
            // Excel turns "0405" into the number 405. Real HSN/SAC codes have an even number of
            // digits (2/4/6/8), so a numeric cell with an odd length lost a leading zero.
            if (code.Length % 2 == 1 && code.All(char.IsDigit)) code = "0" + code;
            if (!CodePattern().IsMatch(code)) { errors.Add(new { row = i + 2, message = $"Invalid HSN/SAC code \"{rawCode}\" (2–8 digits)" }); continue; }
            decimal? rate = null;
            var rateText = Cell(rows[i], "GstRate").Replace("%", "");
            if (rateText.Length > 0)
            {
                if (!decimal.TryParse(rateText, out var r) || r < 0 || r > 100) { errors.Add(new { row = i + 2, message = $"Invalid GST rate \"{rateText}\"" }); continue; }
                rate = r;
            }
            var description = Cell(rows[i], "Description");
            clean.Add(new { code, description = description.Length > 1000 ? description[..1000] : description, gstRate = rate });
        }

        var inserted = 0;
        var updated = 0;
        if (clean.Count > 0)
        {
            using var connection = connectionFactory.Create();
            var p = new DynamicParameters();
            p.Add("RowsJson", JsonSerializer.Serialize(clean));
            p.Add("Inserted", dbType: DbType.Int32, direction: ParameterDirection.Output);
            p.Add("Updated", dbType: DbType.Int32, direction: ParameterDirection.Output);
            await connection.ExecuteAsync("dbo.sp_Hsn_ImportBulk", p, commandType: CommandType.StoredProcedure, commandTimeout: 300);
            inserted = p.Get<int>("Inserted");
            updated = p.Get<int>("Updated");
        }

        var session = HttpContext.GetSession()!;
        await audit.LogAsync(session.UserId, "IMPORT", "SETTINGS", recordLabel: $"HSN master: {inserted} new, {updated} updated");
        // Shape matches the other /api/import endpoints so ExcelImportPanel can show the result.
        return Ok(new { inserted = inserted + updated, created = inserted, updated, errors });
    }

    [HttpDelete]
    [RequirePermission("SETTINGS", "EDIT")]
    public async Task<IActionResult> Clear()
    {
        using var connection = connectionFactory.Create();
        var p = new DynamicParameters();
        p.Add("Deleted", dbType: DbType.Int32, direction: ParameterDirection.Output);
        await connection.ExecuteAsync("dbo.sp_Hsn_Clear", p, commandType: CommandType.StoredProcedure);
        var deleted = p.Get<int>("Deleted");
        var session = HttpContext.GetSession()!;
        await audit.LogAsync(session.UserId, "DELETE", "SETTINGS", recordLabel: $"HSN master cleared ({deleted} codes)");
        return Ok(new { deleted });
    }
}
