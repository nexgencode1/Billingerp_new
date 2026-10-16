using BillingErp.Api.Auth;
using BillingErp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

public record AskRequest(string? Question);

// "Ask your data" — see AskService for the safety model (the model only picks a report intent).
[ApiController]
[RequirePlanFeature("AI_REPORTS")]
[Route("api/ask")]
[RequirePermission("REPORTS", "VIEW")]
public class AskController(AskService ask) : ControllerBase
{
    [HttpGet("status")]
    public async Task<IActionResult> Status() => Ok(new
    {
        modelAvailable = await ask.IsModelAvailableAsync(),
        intents = AskService.Intents.Select(kv => new { intent = kv.Key, description = kv.Value }),
    });

    [HttpPost]
    public async Task<IActionResult> Ask([FromBody] AskRequest? body)
    {
        var question = body?.Question?.Trim();
        if (string.IsNullOrEmpty(question)) return BadRequest(new { error = "Type a question" });
        if (question.Length > 500) return BadRequest(new { error = "Please keep the question under 500 characters" });

        var r = await ask.AskAsync(question);
        return Ok(new
        {
            answer = r.Answer, intent = r.Intent, period = r.PeriodLabel, from = r.From, to = r.To, engine = r.Engine,
            columns = r.Columns, rows = r.Rows, chart = r.Chart.Select(c => new { label = c.Label, value = c.Value }), link = r.Link,
        });
    }
}
