using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// GSTR-1 / GSTR-3B preparation from the app's own sales & purchases. This formats existing data —
// classification thresholds, state codes, UQCs and the JSON version all come from Config/gst.json.
// The JSON follows the GSTR-1 offline-tool layout as understood when this was written; it must be
// validated with the official offline tool before upload. // VERIFY: current schema
[ApiController]
[Route("api/gst")]
[RequirePermission("REPORTS", "VIEW")]
public class GstReturnsController(SqlConnectionFactory connectionFactory, GstConfig gst) : ControllerBase
{
    private record BusinessRow(string? Gstin, string? State, string Name);
    private record InvoiceRateRow(int SaleId, string InvoiceNumber, DateTime InvoiceDate, decimal InvoiceValue, string? CustomerName,
        string? CustomerGstin, string? CustomerState, bool IsInterstate, decimal Rate, decimal TaxableValue, decimal Igst, decimal Cgst, decimal Sgst);
    private record HsnRow(string HsnCode, string Description, string UnitName, string? UnitShortName, decimal Rate, decimal Quantity,
        decimal TotalValue, decimal TaxableValue, decimal Igst, decimal Cgst, decimal Sgst, bool HasB2b);
    private record DocRow(string? FromNumber, string? ToNumber, int TotalCount, int CancelledCount);
    private record CreditNoteRow(string ReturnNumber, DateTime ReturnDate, decimal TotalAmount, string InvoiceNumber, string? CustomerName, string? CustomerGstin);

    private static decimal R(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);

    [HttpGet("gstr1")]
    public async Task<IActionResult> Gstr1([FromQuery] string? from, [FromQuery] string? to)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Gst_Gstr1Data", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
        var business = await multi.ReadSingleOrDefaultAsync<BusinessRow>() ?? new BusinessRow(null, null, "");
        var lines = (await multi.ReadAsync<InvoiceRateRow>()).ToList();
        var hsnRows = (await multi.ReadAsync<HsnRow>()).ToList();
        var docs = await multi.ReadSingleAsync<DocRow>();
        var creditNotes = (await multi.ReadAsync<CreditNoteRow>()).ToList();

        var warnings = new List<string>();
        var businessCode = gst.StateCode(business.State, business.Gstin);
        if (string.IsNullOrWhiteSpace(business.Gstin)) warnings.Add("Business GSTIN is not set (Settings → Business Profile).");
        if (businessCode is null) warnings.Add($"No state code found for the business state \"{business.State}\" — check Config/gst.json.");

        var threshold = gst.B2clInvoiceThreshold;
        var invoices = lines.GroupBy(l => l.SaleId).Select(g => g.ToList()).ToList();
        var unknownStates = new HashSet<string>();

        var b2b = new List<object>();
        var b2cl = new List<object>();
        var b2csBuckets = new Dictionary<(string SupplyType, string Pos, decimal Rate), (decimal Txval, decimal Iamt, decimal Camt, decimal Samt)>();
        decimal b2bValue = 0, b2clValue = 0, b2csValue = 0;

        foreach (var inv in invoices)
        {
            var h = inv[0];
            // Walk-in / no state: place of supply is the business's own state (intra-state sale).
            var pos = h.CustomerName is null && h.CustomerGstin is null ? businessCode : gst.StateCode(h.CustomerState, h.CustomerGstin);
            if (pos is null)
            {
                unknownStates.Add(h.CustomerState ?? "(blank)");
                pos = businessCode ?? "";
            }
            var items = inv.Select(l => new { rate = l.Rate, taxableValue = R(l.TaxableValue), igst = R(l.Igst), cgst = R(l.Cgst), sgst = R(l.Sgst) }).ToList();
            var row = new
            {
                saleId = h.SaleId, invoiceNumber = h.InvoiceNumber, invoiceDate = h.InvoiceDate, customerName = h.CustomerName,
                gstin = h.CustomerGstin, pos, invoiceValue = R(h.InvoiceValue), items,
            };

            if (h.CustomerGstin is not null) { b2b.Add(row); b2bValue += h.InvoiceValue; }
            else if (h.IsInterstate && h.InvoiceValue > threshold) { b2cl.Add(row); b2clValue += h.InvoiceValue; }
            else
            {
                b2csValue += h.InvoiceValue;
                foreach (var l in inv)
                {
                    var key = (h.IsInterstate ? "INTER" : "INTRA", pos, l.Rate);
                    b2csBuckets.TryGetValue(key, out var acc);
                    b2csBuckets[key] = (acc.Txval + l.TaxableValue, acc.Iamt + l.Igst, acc.Camt + l.Cgst, acc.Samt + l.Sgst);
                }
            }
        }
        if (unknownStates.Count > 0)
            warnings.Add($"No GST state code for: {string.Join(", ", unknownStates)} — those invoices use the business state. Fix the customer state or Config/gst.json.");

        var b2cs = b2csBuckets.OrderBy(k => k.Key.Pos).ThenBy(k => k.Key.Rate).Select(k => new
        {
            supplyType = k.Key.SupplyType, pos = k.Key.Pos, rate = k.Key.Rate,
            taxableValue = R(k.Value.Txval), igst = R(k.Value.Iamt), cgst = R(k.Value.Camt), sgst = R(k.Value.Samt),
        }).ToList();

        var hsn = hsnRows.Select(h => new
        {
            hsnCode = h.HsnCode, description = h.Description, uqc = gst.Uqc(h.UnitName, h.UnitShortName), rate = h.Rate,
            quantity = R(h.Quantity), totalValue = R(h.TotalValue), taxableValue = R(h.TaxableValue),
            igst = R(h.Igst), cgst = R(h.Cgst), sgst = R(h.Sgst),
        }).ToList();
        if (hsnRows.Any(h => h.HsnCode == "NA")) warnings.Add("Some products sold have no HSN code — add it on the product so the HSN summary is complete.");
        if (creditNotes.Count > 0) warnings.Add("Credit notes (sale returns) are listed for review but not included in the JSON — this app doesn't record their tax split.");

        var fp = f.ToString("MMyyyy");
        var json = new Dictionary<string, object?>
        {
            ["gstin"] = business.Gstin ?? "",
            ["fp"] = fp,
            ["version"] = gst.Gstr1JsonVersion,
            ["hash"] = "hash",
            ["b2b"] = b2b.Cast<dynamic>().GroupBy(r => (string)r.gstin).Select(g => new
            {
                ctin = g.Key,
                inv = g.Select(r => new
                {
                    inum = (string)r.invoiceNumber, idt = ((DateTime)r.invoiceDate).ToString("dd-MM-yyyy"), val = (decimal)r.invoiceValue,
                    pos = (string)r.pos, rchrg = "N", inv_typ = "R",
                    itms = ((IEnumerable<dynamic>)r.items).Select((it, i) => new
                    {
                        num = i + 1,
                        itm_det = new { txval = (decimal)it.taxableValue, rt = (decimal)it.rate, iamt = (decimal)it.igst, camt = (decimal)it.cgst, samt = (decimal)it.sgst, csamt = 0m },
                    }),
                }),
            }),
            ["b2cl"] = b2cl.Cast<dynamic>().GroupBy(r => (string)r.pos).Select(g => new
            {
                pos = g.Key,
                inv = g.Select(r => new
                {
                    inum = (string)r.invoiceNumber, idt = ((DateTime)r.invoiceDate).ToString("dd-MM-yyyy"), val = (decimal)r.invoiceValue,
                    itms = ((IEnumerable<dynamic>)r.items).Select((it, i) => new
                    {
                        num = i + 1,
                        itm_det = new { txval = (decimal)it.taxableValue, rt = (decimal)it.rate, iamt = (decimal)it.igst, csamt = 0m },
                    }),
                }),
            }),
            ["b2cs"] = b2cs.Select(b => new
            {
                sply_ty = b.supplyType, pos = b.pos, typ = "OE", txval = b.taxableValue, rt = b.rate,
                iamt = b.igst, camt = b.cgst, samt = b.sgst, csamt = 0m,
            }),
            ["hsn"] = new
            {
                data = hsn.Select((h, i) => new
                {
                    num = i + 1, hsn_sc = h.hsnCode, desc = h.description, uqc = h.uqc, qty = h.quantity, val = h.totalValue,
                    txval = h.taxableValue, iamt = h.igst, camt = h.cgst, samt = h.sgst, csamt = 0m, rt = h.rate,
                }),
            },
            ["doc_issue"] = docs.TotalCount == 0 ? null : new
            {
                doc_det = new[]
                {
                    new
                    {
                        doc_num = 1,
                        docs = new[]
                        {
                            new { num = 1, from = docs.FromNumber, to = docs.ToNumber, totnum = docs.TotalCount, cancel = docs.CancelledCount, net_issue = docs.TotalCount - docs.CancelledCount },
                        },
                    },
                },
            },
        };

        return Ok(new
        {
            period = new { fp, from = f, to = t },
            business = new { name = business.Name, gstin = business.Gstin, state = business.State, stateCode = businessCode },
            config = new { b2clThreshold = threshold, jsonVersion = gst.Gstr1JsonVersion },
            warnings,
            summary = new
            {
                b2bCount = b2b.Count, b2bValue = R(b2bValue),
                b2clCount = b2cl.Count, b2clValue = R(b2clValue),
                b2csCount = invoices.Count - b2b.Count - b2cl.Count, b2csValue = R(b2csValue),
                taxableValue = R(lines.Sum(l => l.TaxableValue)), igst = R(lines.Sum(l => l.Igst)),
                cgst = R(lines.Sum(l => l.Cgst)), sgst = R(lines.Sum(l => l.Sgst)),
            },
            b2b, b2cl, b2cs, hsn,
            documents = new { fromNumber = docs.FromNumber, toNumber = docs.ToNumber, total = docs.TotalCount, cancelled = docs.CancelledCount, net = docs.TotalCount - docs.CancelledCount },
            creditNotes = creditNotes.Select(c => new
            {
                returnNumber = c.ReturnNumber, returnDate = c.ReturnDate, totalAmount = c.TotalAmount, invoiceNumber = c.InvoiceNumber,
                customerName = c.CustomerName, gstin = c.CustomerGstin,
            }),
            json,
        });
    }

    private record OutwardRow(decimal TaxableValue, decimal Igst, decimal Cgst, decimal Sgst);
    private record InterStateRow(string? CustomerState, decimal TaxableValue, decimal Igst);
    private record ItcRow(decimal Igst, decimal Cgst, decimal Sgst, decimal TaxableValue);

    [HttpGet("gstr3b")]
    public async Task<IActionResult> Gstr3b([FromQuery] string? from, [FromQuery] string? to)
    {
        var (f, t) = ReportDateRange.Parse(from, to);
        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Gst_Gstr3bData", new { From = f, To = t }, commandType: CommandType.StoredProcedure);
        var outward = await multi.ReadSingleAsync<OutwardRow>();
        var interState = (await multi.ReadAsync<InterStateRow>()).ToList();
        var itc = await multi.ReadSingleAsync<ItcRow>();
        var nilRated = await multi.ReadSingleAsync<decimal>();

        // Simple head-wise net (output − ITC, floored at 0). The real set-off order and
        // cross-utilisation of IGST/CGST/SGST credit is not modelled. // VERIFY: official rule
        object Net(decimal output, decimal credit) => new { output = R(output), credit = R(credit), payable = R(Math.Max(0, output - credit)), carryForward = R(Math.Max(0, credit - output)) };

        return Ok(new
        {
            period = new { fp = f.ToString("MMyyyy"), from = f, to = t },
            outward = new { taxableValue = R(outward.TaxableValue), igst = R(outward.Igst), cgst = R(outward.Cgst), sgst = R(outward.Sgst) },
            nilRatedValue = R(nilRated),
            interStateUnregistered = interState.Select(i => new
            {
                state = i.CustomerState ?? "(not set)", pos = gst.StateCode(i.CustomerState), taxableValue = R(i.TaxableValue), igst = R(i.Igst),
            }),
            itc = new { taxableValue = R(itc.TaxableValue), igst = R(itc.Igst), cgst = R(itc.Cgst), sgst = R(itc.Sgst) },
            net = new { igst = Net(outward.Igst, itc.Igst), cgst = Net(outward.Cgst, itc.Cgst), sgst = Net(outward.Sgst, itc.Sgst) },
        });
    }
}
