namespace BillingErp.Api.Services;

// Typed access to Config/gst.json. Every value here is a compliance value that must be confirmed
// by a human against current GSTN rules — nothing is hard-coded in C#. // VERIFY: official rule
public class GstConfig(IConfiguration configuration)
{
    private IConfigurationSection Section => configuration.GetSection("Gst");

    public decimal B2clInvoiceThreshold => Section.GetValue<decimal>("B2clInvoiceThreshold");

    public string Gstr1JsonVersion => Section.GetValue<string>("Gstr1JsonVersion") ?? "";

    private Dictionary<string, string> Map(string key) =>
        Section.GetSection(key).GetChildren()
            .Where(c => c.Value is not null)
            .ToDictionary(c => c.Key.Trim(), c => c.Value!, StringComparer.OrdinalIgnoreCase);

    // GSTIN's first two digits are the state code — trust that over free-text state names.
    public string? StateCode(string? stateName, string? gstin = null)
    {
        if (!string.IsNullOrWhiteSpace(gstin) && gstin.Trim().Length >= 2 && char.IsDigit(gstin.Trim()[0]) && char.IsDigit(gstin.Trim()[1]))
            return gstin.Trim()[..2];
        if (string.IsNullOrWhiteSpace(stateName)) return null;
        return Map("StateCodes").TryGetValue(stateName.Trim(), out var code) ? code : null;
    }

    public string Uqc(string? unitName, string? unitShortName)
    {
        var map = Map("UqcByUnit");
        if (unitName is not null && map.TryGetValue(unitName.Trim(), out var a)) return a;
        if (unitShortName is not null && map.TryGetValue(unitShortName.Trim(), out var b)) return b;
        return "OTH";
    }
}
