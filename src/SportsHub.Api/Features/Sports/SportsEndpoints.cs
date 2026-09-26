using Microsoft.EntityFrameworkCore;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Sports;

public sealed record PlayerResponse(Guid Id, string Name, string League, string? Team, string? Position, bool IsActive);

public static class SportsEndpoints
{
    public static IEndpointRouteBuilder MapSportsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/players", async (SportsHubDbContext db, int page = 1, int pageSize = 50, string? search = null, CancellationToken cancellationToken = default) =>
        {
            page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
            var query = db.Players.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.FirstName.Contains(term) || x.LastName.Contains(term) || (x.DisplayName != null && x.DisplayName.Contains(term)) || x.Aliases.Any(a => a.Name.Contains(term)));
            }
            var players = await query.OrderBy(x => x.LastName).ThenBy(x => x.FirstName)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new PlayerResponse(x.Id, x.DisplayName ?? x.FirstName + " " + x.LastName, x.League.Abbreviation, x.Team == null ? null : x.Team.Abbreviation, x.Position, x.IsActive))
                .ToListAsync(cancellationToken);
            return Results.Ok(players);
        }).WithTags("Sports").RequireAuthorization();
        return endpoints;
    }
}
