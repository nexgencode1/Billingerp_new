using System.Text.Json.Serialization;
using BillingErp.Api.Auth;
using BillingErp.Api.Data;
using BillingErp.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// GST compliance values (state codes, B2CL threshold, UQC map...) live in their own file so a
// human can verify/update them without touching code. // VERIFY: official rule
builder.Configuration.AddJsonFile("Config/gst.json", optional: false, reloadOnChange: true);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // ASP.NET Core's default camelCase output already matches Prisma's JSON shape; this just
        // guards against reference-cycle serialization if an entity is ever returned directly.
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddOpenApi();

// EF Core is schema/migrations only in this app — every runtime read/write goes through a
// stored procedure called via Dapper (see Data/StoredProcedures/*.sql + SqlConnectionFactory).
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddSingleton<SqlConnectionFactory>();

builder.Services.AddScoped<TokenService>();
builder.Services.AddSingleton<PortalTokenService>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<StockService>();
builder.Services.AddScoped<NumberingService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<DemoDataService>();
builder.Services.AddSingleton<GstConfig>();
builder.Services.AddScoped<SaleService>();
builder.Services.AddScoped<RecurringInvoiceService>();
builder.Services.AddScoped<ReminderService>();
builder.Services.AddHostedService<RecurringInvoiceWorker>();
builder.Services.AddHostedService<ReminderWorker>();
builder.Services.AddScoped<BackupService>();
builder.Services.AddHostedService<AutoBackupWorker>();
builder.Services.AddHttpClient();
builder.Services.AddScoped<AskService>();

var app = builder.Build();

// Every unhandled exception (e.g. a stored procedure raising a FK-violation error) returns a
// clean JSON error instead of leaking a raw SqlException stack trace to the client; details are
// still logged server-side.
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (feature?.Error is not null)
        {
            context.RequestServices.GetRequiredService<ILogger<Program>>()
                .LogError(feature.Error, "Unhandled exception on {Path}", context.Request.Path);
        }
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { error = "Something went wrong. Please try again." });
    });
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    using var scope = app.Services.CreateScope();
    var connectionString = builder.Configuration.GetConnectionString("Default")!;
    var scriptsDir = Path.Combine(AppContext.BaseDirectory, "Data", "StoredProcedures");
    await SqlScriptRunner.ApplyAllAsync(connectionString, scriptsDir);

    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbSeeder.SeedAsync(db);
}

app.UseMiddleware<SessionMiddleware>();

app.MapControllers();

app.Run();
