using System.Data;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace BillingErp.Api.Controllers;

// Ports src/app/api/dashboard/summary/route.ts.
[ApiController]
[Route("api/dashboard")]
public class DashboardController(SqlConnectionFactory connectionFactory) : ControllerBase
{
    private record KpiRow(
        decimal TodaySales, decimal TodayPurchase, decimal TotalReceivable, decimal TotalPayable,
        int TotalProducts, int TotalCustomers, int LowStockCount, decimal TodayProfit,
        decimal MonthlySales, decimal MonthlyExpenses);

    private record TrendRow(DateTime Day, decimal Sales, decimal Purchase);

    private record PaymentBreakdownRow(string Method, decimal Amount);

    [HttpGet("summary")]
    [RequirePermission("DASHBOARD", "VIEW")]
    public async Task<IActionResult> Summary([FromQuery] string? range, [FromQuery] string? from, [FromQuery] string? to)
    {
        var rangeKey = range ?? "30d";
        var (rangeFrom, rangeTo) = DashboardDateRange.Get(rangeKey, from, to);
        var (todayFrom, todayTo) = DashboardDateRange.Get("today", null, null);
        var monthStart = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1);

        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Dashboard_Summary", new
        {
            TodayFrom = todayFrom,
            TodayTo = todayTo,
            MonthStart = monthStart,
            RangeFrom = rangeFrom,
            RangeTo = rangeTo,
        }, commandType: CommandType.StoredProcedure);

        var kpi = await multi.ReadSingleAsync<KpiRow>();
        var trend = (await multi.ReadAsync<TrendRow>()).ToList();
        var paymentBreakdown = (await multi.ReadAsync<PaymentBreakdownRow>()).ToList();

        return Ok(new
        {
            kpis = new
            {
                todaySales = kpi.TodaySales,
                todayPurchase = kpi.TodayPurchase,
                totalReceivable = kpi.TotalReceivable,
                totalPayable = kpi.TotalPayable,
                totalProducts = kpi.TotalProducts,
                totalCustomers = kpi.TotalCustomers,
                lowStockCount = kpi.LowStockCount,
                todayProfit = kpi.TodayProfit,
                monthlySales = kpi.MonthlySales,
                monthlyExpenses = kpi.MonthlyExpenses,
            },
            trend = trend.Select(t => new { date = t.Day.ToString("yyyy-MM-dd"), sales = t.Sales, purchase = t.Purchase }),
            paymentBreakdown = paymentBreakdown.Select(p => new { method = p.Method, amount = p.Amount }),
        });
    }

    private record PeriodRow(int Slot, decimal Sales, decimal TaxableSales, int Invoices, decimal Cogs, decimal Expenses,
        decimal Received, decimal Purchases, int NewCustomers);
    private record TopProductRow(int ProductId, string Name, decimal Quantity, decimal Amount, decimal Profit);
    private record TopCustomerRow(int CustomerId, string Name, int Invoices, decimal Amount, decimal Due);
    private record AgingRow(string Bucket, int SortOrder, decimal Amount, int Invoices);
    private record CategoryRow(string Category, decimal Amount);
    private record WeekdayRow(int Weekday, decimal Amount, int Invoices);

    // Like-for-like comparison window: month-to-date vs the same days last month, year-to-date vs
    // the same span last year, otherwise the equally long period just before.
    private static (DateTime From, DateTime To) PreviousPeriod(string range, DateTime from, DateTime to) => range switch
    {
        "month" => (from.AddMonths(-1), to.AddMonths(-1)),
        "year" => (from.AddYears(-1), to.AddYears(-1)),
        _ => (from - (to.Date.AddDays(1) - from.Date), from.AddMilliseconds(-1)),
    };

    [HttpGet("analytics")]
    [RequirePermission("DASHBOARD", "VIEW")]
    public async Task<IActionResult> Analytics([FromQuery] string? range, [FromQuery] string? from, [FromQuery] string? to)
    {
        var rangeKey = range ?? "month";
        var (f, t) = DashboardDateRange.Get(rangeKey, from, to);
        var (pf, pt) = PreviousPeriod(rangeKey, f, t);

        using var connection = connectionFactory.Create();
        using var multi = await connection.QueryMultipleAsync("dbo.sp_Dashboard_Analytics",
            new { From = f, To = t, PrevFrom = pf, PrevTo = pt }, commandType: CommandType.StoredProcedure);
        var periods = (await multi.ReadAsync<PeriodRow>()).ToDictionary(p => p.Slot);
        var topProducts = (await multi.ReadAsync<TopProductRow>()).ToList();
        var topCustomers = (await multi.ReadAsync<TopCustomerRow>()).ToList();
        var aging = (await multi.ReadAsync<AgingRow>()).ToList();
        var categories = (await multi.ReadAsync<CategoryRow>()).ToList();
        var weekdays = (await multi.ReadAsync<WeekdayRow>()).ToList();

        static object Period(PeriodRow p)
        {
            var grossProfit = p.TaxableSales - p.Cogs;
            var netProfit = grossProfit - p.Expenses;
            return new
            {
                sales = p.Sales, invoices = p.Invoices, avgBill = p.Invoices > 0 ? Math.Round(p.Sales / p.Invoices, 2) : 0,
                grossProfit, netProfit, expenses = p.Expenses, received = p.Received, purchases = p.Purchases,
                newCustomers = p.NewCustomers,
                grossMargin = p.TaxableSales > 0 ? Math.Round(grossProfit / p.TaxableSales * 100, 2) : 0,
                netMargin = p.TaxableSales > 0 ? Math.Round(netProfit / p.TaxableSales * 100, 2) : 0,
            };
        }

        string[] dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return Ok(new
        {
            period = new { from = f, to = t, previousFrom = pf, previousTo = pt },
            current = Period(periods[1]),
            previous = Period(periods[2]),
            topProducts = topProducts.Select(p => new { productId = p.ProductId, name = p.Name, quantity = p.Quantity, amount = p.Amount, profit = p.Profit }),
            topCustomers = topCustomers.Select(c => new { customerId = c.CustomerId, name = c.Name, invoices = c.Invoices, amount = c.Amount, due = c.Due }),
            aging = aging.Select(a => new { bucket = a.Bucket, amount = a.Amount, invoices = a.Invoices }),
            categories = categories.Select(c => new { category = c.Category, amount = c.Amount }),
            weekdays = Enumerable.Range(1, 7).Select(d =>
            {
                var w = weekdays.FirstOrDefault(x => x.Weekday == d);
                return new { day = dayNames[d - 1], amount = w?.Amount ?? 0, invoices = w?.Invoices ?? 0 };
            }),
        });
    }
}
