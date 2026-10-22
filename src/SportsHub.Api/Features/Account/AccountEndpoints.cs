using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using SportsHub.Api.Infrastructure;
using SportsHub.Infrastructure.Identity;

namespace SportsHub.Api.Features.Account;

public sealed record LoginRequest([property: Required, EmailAddress] string Email, [property: Required] string Password, bool RememberMe = false);
public sealed record KellyPreferencesRequest(decimal KellyMultiplier);
public sealed record UserResponse(string Id, string Email, IReadOnlyList<string> Roles, decimal KellyMultiplier);

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/account").WithTags("Account");
        group.MapGet("/antiforgery", (IAntiforgery antiforgery, HttpContext context) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new { token = tokens.RequestToken });
        }).AllowAnonymous();
        group.MapPost("/login", LoginAsync).AllowAnonymous().ValidateAntiforgery();
        group.MapPost("/logout", LogoutAsync).RequireAuthorization().ValidateAntiforgery();
        group.MapGet("/me", CurrentUserAsync).RequireAuthorization();
        group.MapPut("/preferences/kelly", UpdateKellyPreferencesAsync).RequireAuthorization().ValidateAntiforgery();
        return endpoints;
    }

    private static async Task<IResult> LoginAsync(LoginRequest request, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signInManager)
    {
        if (!new EmailAddressAttribute().IsValid(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["credentials"] = ["A valid email and password are required."] });
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null) return Results.Problem(statusCode: 401, title: "Invalid credentials.");
        var result = await signInManager.PasswordSignInAsync(user, request.Password, request.RememberMe, lockoutOnFailure: true);
        if (!result.Succeeded) return Results.Problem(statusCode: 401, title: "Invalid credentials.");
        return Results.Ok(await ToResponseAsync(user, users));
    }

    private static async Task<IResult> LogoutAsync(SignInManager<ApplicationUser> signInManager)
    {
        await signInManager.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> CurrentUserAsync(HttpContext context, UserManager<ApplicationUser> users)
    {
        var user = await users.GetUserAsync(context.User);
        return user is null ? Results.Unauthorized() : Results.Ok(await ToResponseAsync(user, users));
    }

    private static async Task<IResult> UpdateKellyPreferencesAsync(KellyPreferencesRequest request, HttpContext context, UserManager<ApplicationUser> users)
    {
        if (request.KellyMultiplier is < 0m or > 1m)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["kellyMultiplier"] = ["Kelly multiplier must be between 0 and 1."] });
        var user = await users.GetUserAsync(context.User);
        if (user is null) return Results.Unauthorized();
        user.KellyMultiplier = decimal.Round(request.KellyMultiplier, 4, MidpointRounding.AwayFromZero);
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            return Results.ValidationProblem(result.Errors.GroupBy(x => x.Code).ToDictionary(x => x.Key, x => x.Select(error => error.Description).ToArray()));
        return Results.Ok(await ToResponseAsync(user, users));
    }

    private static async Task<UserResponse> ToResponseAsync(ApplicationUser user, UserManager<ApplicationUser> users) =>
        new(user.Id, user.Email!, (await users.GetRolesAsync(user)).ToArray(), user.KellyMultiplier);
}
