using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Fantasy;

public static class FantasyEndpoints
{
    public static IEndpointRouteBuilder MapFantasyEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/fantasy/summary", async (ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var draftCount = await db.Drafts.AsNoTracking().CountAsync(x => x.UserId == userId, cancellationToken);
            return Results.Ok(new { draftCount, message = "Fantasy Draft Helper foundation is ready." });
        }).WithTags("Fantasy").RequireAuthorization();
        return endpoints;
    }
}
