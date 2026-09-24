using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportsHub.Domain.Betting;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Betting;

public static class BettingEndpoints
{
    public static IEndpointRouteBuilder MapBettingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/betting/summary", async (ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var betCount = await db.Bets.AsNoTracking().CountAsync(x => x.UserId == userId, cancellationToken);
            var pendingCount = await db.Bets.AsNoTracking().CountAsync(x => x.UserId == userId && x.Status == BetStatus.Pending, cancellationToken);
            return Results.Ok(new { betCount, pendingCount, message = "Sports Betting Tracker foundation is ready." });
        }).WithTags("Betting").RequireAuthorization();
        return endpoints;
    }
}
