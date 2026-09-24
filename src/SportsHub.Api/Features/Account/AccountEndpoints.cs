using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using SportsHub.Api.Infrastructure;
using SportsHub.Infrastructure.Identity;

namespace SportsHub.Api.Features.Account;

public sealed record LoginRequest([property: Required, EmailAddress] string Email, [property: Required] string Password, bool RememberMe = false);
public sealed record UserResponse(string Id, string Email, IReadOnlyList<string> Roles);

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

    private static async Task<UserResponse> ToResponseAsync(ApplicationUser user, UserManager<ApplicationUser> users) =>
        new(user.Id, user.Email!, (await users.GetRolesAsync(user)).ToArray());
}
