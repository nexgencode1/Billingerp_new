using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BillingErp.Api.Services;

public record RazorpayPayment(string Id, string Status, long AmountPaise, string Currency, string? OrderId, string? Method, string? ErrorDescription);
public record RazorpayRefund(string Id, string Status, long AmountPaise);

public class RazorpayException(string message) : Exception(message);

// Thin client over Razorpay's REST API (Orders, Payments, Refunds) — plain HttpClient, no SDK.
// Keys come from configuration (Razorpay:KeyId / Razorpay:KeySecret / Razorpay:WebhookSecret);
// in development they live in `dotnet user-secrets`, never in a checked-in appsettings file.
public class RazorpayService(IHttpClientFactory httpClientFactory, IConfiguration config)
{
    private const string BaseUrl = "https://api.razorpay.com/v1/";

    public string? KeyId => NullIfBlank(config["Razorpay:KeyId"]);
    private string? KeySecret => NullIfBlank(config["Razorpay:KeySecret"]);
    private string? WebhookSecret => NullIfBlank(config["Razorpay:WebhookSecret"]);

    public bool IsConfigured => KeyId is not null && KeySecret is not null;
    public bool WebhookConfigured => WebhookSecret is not null;
    public bool IsTestMode => KeyId?.StartsWith("rzp_test_", StringComparison.Ordinal) ?? false;

    public static long ToPaise(decimal amount) => (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
    public static decimal FromPaise(long paise) => paise / 100m;

    public async Task<string> CreateOrderAsync(long amountPaise, string currency, string receipt, Dictionary<string, string> notes)
    {
        using var doc = await SendAsync(HttpMethod.Post, "orders", new { amount = amountPaise, currency, receipt, notes });
        return doc.RootElement.GetProperty("id").GetString()!;
    }

    public async Task<RazorpayPayment> FetchPaymentAsync(string paymentId)
    {
        using var doc = await SendAsync(HttpMethod.Get, $"payments/{Uri.EscapeDataString(paymentId)}");
        return ReadPayment(doc.RootElement);
    }

    public async Task<List<RazorpayPayment>> FetchOrderPaymentsAsync(string orderId)
    {
        using var doc = await SendAsync(HttpMethod.Get, $"orders/{Uri.EscapeDataString(orderId)}/payments");
        return doc.RootElement.GetProperty("items").EnumerateArray().Select(ReadPayment).ToList();
    }

    // Only needed if the account's auto-capture setting is off (payment left "authorized").
    public async Task<RazorpayPayment> CapturePaymentAsync(string paymentId, long amountPaise, string currency)
    {
        using var doc = await SendAsync(HttpMethod.Post, $"payments/{Uri.EscapeDataString(paymentId)}/capture", new { amount = amountPaise, currency });
        return ReadPayment(doc.RootElement);
    }

    public async Task<RazorpayRefund> RefundAsync(string paymentId, long amountPaise, Dictionary<string, string> notes)
    {
        using var doc = await SendAsync(HttpMethod.Post, $"payments/{Uri.EscapeDataString(paymentId)}/refund", new { amount = amountPaise, speed = "normal", notes });
        var root = doc.RootElement;
        return new RazorpayRefund(root.GetProperty("id").GetString()!, root.GetProperty("status").GetString() ?? "pending", root.GetProperty("amount").GetInt64());
    }

    // Checkout success handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
    public bool VerifyCheckoutSignature(string orderId, string paymentId, string signature)
        => KeySecret is not null && FixedTimeEqualsHex(HmacHex(KeySecret, $"{orderId}|{paymentId}"), signature);

    // Webhook signature: HMAC-SHA256(raw request body, webhook secret) in X-Razorpay-Signature.
    public bool VerifyWebhookSignature(string rawBody, string? signature)
        => WebhookSecret is not null && signature is not null && FixedTimeEqualsHex(HmacHex(WebhookSecret, rawBody), signature);

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, object? body = null)
    {
        if (!IsConfigured) throw new RazorpayException("Razorpay is not configured (set Razorpay:KeyId and Razorpay:KeySecret).");

        using var request = new HttpRequestMessage(method, BaseUrl + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.ASCII.GetBytes($"{KeyId}:{KeySecret}")));
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        var client = httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);
        using var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new RazorpayException(ErrorMessage(text, (int)response.StatusCode));
        return JsonDocument.Parse(text);
    }

    private static RazorpayPayment ReadPayment(JsonElement p) => new(
        p.GetProperty("id").GetString()!,
        p.GetProperty("status").GetString() ?? "",
        p.GetProperty("amount").GetInt64(),
        p.GetProperty("currency").GetString() ?? "INR",
        p.TryGetProperty("order_id", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null,
        p.TryGetProperty("method", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null,
        p.TryGetProperty("error_description", out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null);

    private static string ErrorMessage(string body, int statusCode)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var error = doc.RootElement.GetProperty("error");
            if (error.ValueKind == JsonValueKind.String) return $"Razorpay: {error.GetString()} ({statusCode})";
            if (error.TryGetProperty("description", out var d)) return $"Razorpay: {d.GetString()}";
        }
        catch (JsonException) { }
        catch (KeyNotFoundException) { }
        return $"Razorpay request failed ({statusCode})";
    }

    private static string HmacHex(string secret, string payload)
        => Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload)));

    private static bool FixedTimeEqualsHex(string expectedHex, string actual)
        => CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expectedHex), Encoding.ASCII.GetBytes(actual.Trim().ToLowerInvariant()));

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
