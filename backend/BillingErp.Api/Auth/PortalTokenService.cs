using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.IdentityModel.Tokens;

namespace BillingErp.Api.Auth;

public record PortalSession(int CustomerId, string Name);

// Customer-portal tokens. Signed with a key DERIVED from Jwt:Secret ("<secret>|portal"), so a
// portal token can never validate as a staff session (and vice versa), and they live in their own
// cookie. The frontend middleware derives the same key (src/lib/portal-jwt.ts).
public class PortalTokenService(IConfiguration config)
{
    public const string CookieName = "portal_session";
    public const int TtlSeconds = 60 * 60 * 24; // 1 day

    private SymmetricSecurityKey GetKey()
    {
        var secret = config["Jwt:Secret"];
        if (string.IsNullOrEmpty(secret)) throw new InvalidOperationException("Jwt:Secret is not configured");
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret + "|portal"));
    }

    public string CreateToken(PortalSession s)
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new JwtPayload
        {
            { "kind", "portal" },
            { "customerId", s.CustomerId },
            { "name", s.Name },
            { "iat", now.ToUnixTimeSeconds() },
            { "exp", now.AddSeconds(TtlSeconds).ToUnixTimeSeconds() },
        };
        var header = new JwtHeader(new SigningCredentials(GetKey(), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
    }

    public PortalSession? Validate(string? token)
    {
        if (string.IsNullOrEmpty(token)) return null;
        var handler = new JwtSecurityTokenHandler { InboundClaimTypeMap = new Dictionary<string, string>() };
        try
        {
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = GetKey(),
            }, out _);
            if (principal.FindFirst("kind")?.Value != "portal") return null;
            return new PortalSession(int.Parse(principal.FindFirst("customerId")!.Value), principal.FindFirst("name")?.Value ?? "");
        }
        catch
        {
            return null;
        }
    }
}

// Requires a valid portal_session cookie; exposes it as HttpContext.Items["Portal"].
public class RequirePortalSessionAttribute : Attribute, IAsyncActionFilter
{
    public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var tokens = context.HttpContext.RequestServices.GetRequiredService<PortalTokenService>();
        var session = tokens.Validate(context.HttpContext.Request.Cookies[PortalTokenService.CookieName]);
        if (session is null)
        {
            context.Result = new JsonResult(new { error = "Please sign in to the customer portal" }) { StatusCode = 401 };
            return Task.CompletedTask;
        }
        context.HttpContext.Items["Portal"] = session;
        return next();
    }
}

public static class PortalContextExtensions
{
    public static PortalSession GetPortal(this HttpContext context) => (PortalSession)context.Items["Portal"]!;
}
