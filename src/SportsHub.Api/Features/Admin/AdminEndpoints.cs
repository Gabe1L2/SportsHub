using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SportsHub.Api.Infrastructure;
using SportsHub.Infrastructure.Identity;

namespace SportsHub.Api.Features.Admin;

public sealed record CreateUserRequest([property: Required, EmailAddress] string Email, [property: Required, MinLength(12)] string Password);
public sealed record AdminUserResponse(string Id, string Email, DateTime CreatedAtUtc);

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/users").WithTags("Admin").RequireAuthorization("AdminOnly");
        group.MapGet("/", ListUsersAsync);
        group.MapPost("/", CreateUserAsync).ValidateAntiforgery();
        return endpoints;
    }

    private static async Task<IResult> ListUsersAsync(UserManager<ApplicationUser> users, int page = 1, int pageSize = 50, CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var items = await users.Users.AsNoTracking().OrderBy(x => x.Email).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new AdminUserResponse(x.Id, x.Email!, x.CreatedAtUtc)).ToListAsync(cancellationToken);
        return Results.Ok(items);
    }

    private static async Task<IResult> CreateUserAsync(CreateUserRequest request, UserManager<ApplicationUser> users, RoleManager<IdentityRole> roles)
    {
        if (!new EmailAddressAttribute().IsValid(request.Email))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["A valid email is required."] });
        var email = request.Email.Trim();
        if (await users.FindByEmailAsync(email) is not null) return Results.Conflict(new { error = "A user with that email already exists." });

        if (!await roles.RoleExistsAsync("User"))
        {
            var roleResult = await roles.CreateAsync(new IdentityRole("User"));
            if (!roleResult.Succeeded) return Results.Problem(statusCode: 500, title: "Unable to initialize the User role.");
        }

        var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
            return Results.ValidationProblem(result.Errors.GroupBy(x => x.Code).ToDictionary(x => x.Key, x => x.Select(e => e.Description).ToArray()));
        await users.AddToRoleAsync(user, "User");
        return Results.Created($"/api/admin/users/{user.Id}", new AdminUserResponse(user.Id, user.Email!, user.CreatedAtUtc));
    }
}
