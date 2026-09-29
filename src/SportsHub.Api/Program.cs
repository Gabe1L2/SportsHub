using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using System.Text.Json.Serialization;
using SportsHub.Api.Features.Account;
using SportsHub.Api.Features.Admin;
using SportsHub.Api.Features.Betting;
using SportsHub.Api.Features.Fantasy;
using SportsHub.Api.Features.Sports;
using SportsHub.Api.Infrastructure;
using SportsHub.Infrastructure;
using SportsHub.Infrastructure.Identity;
using SportsHub.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSportsHubInfrastructure(builder.Configuration);
builder.Services.AddDataProtection()
    .SetApplicationName("SportsHub")
    .PersistKeysToDbContext<SportsHubDbContext>();
builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 12;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
    })
    .AddRoles<IdentityRole>()
    .AddSignInManager()
    .AddEntityFrameworkStores<SportsHubDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddCookie(IdentityConstants.ApplicationScheme, options =>
{
    options.Cookie.Name = "SportsHub.Auth";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    options.SlidingExpiration = true;
    // Non-persistent sign-ins remain session cookies. "Keep me logged in"
    // persists the same protected ticket across browser restarts for 30 days.
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.Events = new CookieAuthenticationEvents
    {
        OnRedirectToLogin = context => { context.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; },
        OnRedirectToAccessDenied = context => { context.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; }
    };
});

builder.Services.AddAuthorizationBuilder().AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-XSRF-TOKEN";
    options.Cookie.Name = "SportsHub.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
});

var app = builder.Build();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestampUtc = DateTime.UtcNow, environment = app.Environment.EnvironmentName })).AllowAnonymous();
app.MapAccountEndpoints();
app.MapAdminEndpoints();
app.MapSportsEndpoints();
app.MapFantasyEndpoints();
app.MapBettingEndpoints();

app.Map("/api/{**unmatched}", () => Results.NotFound(new { error = "API endpoint not found." }));
app.MapFallbackToFile("{*path:nonfile}", "index.html");

await DatabaseStartup.InitializeAsync(app);
await app.RunAsync();

public partial class Program;
