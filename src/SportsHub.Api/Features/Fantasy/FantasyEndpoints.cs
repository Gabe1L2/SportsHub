using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using SportsHub.Api.Infrastructure;
using SportsHub.Domain.Fantasy;
using SportsHub.Domain.Sports;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Fantasy;

public sealed record FantasyDraftRequest(string Name, string SportName, Guid PlatformId, Guid? LeagueId, DraftStatus Status, DateTime? ScheduledAtUtc, DateTime? StartedAtUtc, DateTime? CompletedAtUtc, int EntrantCount, int? DraftSlot, int? RoundCount, decimal BuyIn, int? FinishingPlace, decimal? Winnings, string? Notes);
public sealed record FantasyDraftResponse(Guid Id, string Name, string SportName, Guid PlatformId, string PlatformName, Guid? LeagueId, string? League, DraftStatus Status, DateTime? ScheduledAtUtc, DateTime? StartedAtUtc, DateTime? CompletedAtUtc, int EntrantCount, int? DraftSlot, int? RoundCount, decimal BuyIn, int? FinishingPlace, decimal? Winnings, decimal? ProfitLoss, string CurrencyCode, string? Notes, bool IsArchived);
public sealed record FantasySummaryResponse(int DraftCount, int ActiveDraftCount, int CompletedDraftCount, decimal TotalBuyIns, decimal TotalWinnings, decimal FantasyProfit, decimal BettingProfit, decimal TotalSportsProfit);
public sealed record WorkspaceRequest(JsonElement State);
public sealed record PlayerMatchRequest(IReadOnlyList<string> Names, string? LeagueAbbreviation);
public sealed record PlayerMatchResponse(string SourceName, Guid? PlayerId, string? CanonicalName, string MatchType, bool Ambiguous);
public sealed record PlayerImportRow(string Name, string? TeamAbbreviation, string? Position);
public sealed record PlayerReconcileRequest(IReadOnlyList<PlayerImportRow> Rows, string? LeagueAbbreviation);
public sealed record PlayerReconcileResponse(string SourceName, Guid PlayerId, string CanonicalName, string MatchType, bool Created, string? CurrentTeam, string? ImportedTeam, bool TeamConflict);
public sealed record PlayerTeamRequest(string? TeamAbbreviation);
public sealed record PlayerMergeRequest(Guid DuplicatePlayerId, Guid TargetPlayerId);
public sealed record PlayerAliasRequest(Guid PlayerId, string Name);
public sealed record PlayerAliasResponse(Guid Id, Guid PlayerId, string PlayerName, string Name, string NormalizedName);
public sealed record CanonicalPlayerRequest(string FirstName, string LastName, string? DisplayName, string? TeamAbbreviation, string? Position);
public sealed record CanonicalPlayerResponse(Guid Id, string Name, string League, string? Team, string? Position);

public static class FantasyEndpoints
{
    private const int MaxWorkspaceBytes = 12_000_000;

    public static IEndpointRouteBuilder MapFantasyEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/fantasy").WithTags("Fantasy").RequireAuthorization();
        group.MapGet("/summary", GetSummaryAsync);
        group.MapGet("/drafts", GetDraftsAsync);
        group.MapPost("/drafts", CreateDraftAsync).ValidateAntiforgery();
        group.MapPut("/drafts/{id:guid}", UpdateDraftAsync).ValidateAntiforgery();
        group.MapDelete("/drafts/{id:guid}", ArchiveDraftAsync).ValidateAntiforgery();
        group.MapGet("/workspace", GetWorkspaceAsync);
        group.MapPut("/workspace", SaveWorkspaceAsync).ValidateAntiforgery();
        group.MapPost("/players/match", MatchPlayersAsync).ValidateAntiforgery();
        group.MapPost("/players/reconcile", ReconcilePlayersAsync).ValidateAntiforgery();
        group.MapPut("/players/{id:guid}/team", UpdatePlayerTeamAsync).ValidateAntiforgery();
        group.MapPost("/players/merge", MergePlayersAsync).ValidateAntiforgery();
        group.MapPost("/players", CreateCanonicalPlayerAsync).ValidateAntiforgery();
        group.MapGet("/player-aliases", GetAliasesAsync);
        group.MapPost("/player-aliases", CreateAliasAsync).ValidateAntiforgery();
        group.MapDelete("/player-aliases/{id:guid}", DeleteAliasAsync).ValidateAntiforgery();
        return endpoints;
    }

    private static string UserId(ClaimsPrincipal principal) => principal.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static async Task<IResult> GetSummaryAsync(ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var drafts = db.Drafts.AsNoTracking().Where(x => x.UserId == userId && !x.IsArchived);
        var draftCount = await drafts.CountAsync(cancellationToken);
        var active = await drafts.CountAsync(x => x.Status == DraftStatus.Scheduled || x.Status == DraftStatus.InProgress || x.Status == DraftStatus.Active, cancellationToken);
        var completed = await drafts.CountAsync(x => x.Status == DraftStatus.Completed, cancellationToken);
        var totalBuyIns = await drafts.Where(x => x.Status != DraftStatus.Cancelled).SumAsync(x => (decimal?)x.BuyIn, cancellationToken) ?? 0m;
        var completedBuyIns = await drafts.Where(x => x.Status == DraftStatus.Completed).SumAsync(x => (decimal?)x.BuyIn, cancellationToken) ?? 0m;
        var totalWinnings = await drafts.Where(x => x.Status == DraftStatus.Completed).SumAsync(x => x.Winnings, cancellationToken) ?? 0m;
        var fantasyProfit = totalWinnings - completedBuyIns;
        var bettingProfit = await db.Bets.AsNoTracking()
            .Where(x => x.UserId == userId && x.ActualPayout != null && x.Status != SportsHub.Domain.Betting.BetStatus.Pending)
            .SumAsync(x => (decimal?)(x.ActualPayout!.Value - x.EntryCost), cancellationToken) ?? 0m;
        return Results.Ok(new FantasySummaryResponse(draftCount, active, completed, totalBuyIns, totalWinnings, fantasyProfit, bettingProfit, fantasyProfit + bettingProfit));
    }

    private static async Task<IResult> GetDraftsAsync(ClaimsPrincipal principal, SportsHubDbContext db, bool archived = false, CancellationToken cancellationToken = default)
    {
        var drafts = await db.Drafts.AsNoTracking().Include(x => x.Platform).Include(x => x.League)
            .Where(x => x.UserId == UserId(principal) && x.IsArchived == archived)
            .OrderByDescending(x => x.StartedAtUtc ?? x.ScheduledAtUtc ?? x.CreatedAtUtc).ToListAsync(cancellationToken);
        return Results.Ok(drafts.Select(ToResponse));
    }

    private static async Task<IResult> CreateDraftAsync(FantasyDraftRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var validation = await ValidateDraftAsync(request, db, cancellationToken);
        if (validation is not null) return validation;
        var now = DateTime.UtcNow;
        var draft = new Draft { UserId = UserId(principal), Name = request.Name.Trim(), SportName = request.SportName.Trim(), PlatformId = request.PlatformId, LeagueId = request.LeagueId, CreatedAtUtc = now, UpdatedAtUtc = now };
        Apply(draft, request);
        db.Drafts.Add(draft);
        await db.SaveChangesAsync(cancellationToken);
        await LoadDraftReferencesAsync(draft, db, cancellationToken);
        return Results.Created($"/api/fantasy/drafts/{draft.Id}", ToResponse(draft));
    }

    private static async Task<IResult> UpdateDraftAsync(Guid id, FantasyDraftRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var draft = await db.Drafts.Include(x => x.Platform).Include(x => x.League).SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (draft is null) return Results.NotFound();
        var validation = await ValidateDraftAsync(request, db, cancellationToken);
        if (validation is not null) return validation;
        draft.Name = request.Name.Trim(); draft.SportName = request.SportName.Trim(); draft.PlatformId = request.PlatformId; draft.LeagueId = request.LeagueId; draft.UpdatedAtUtc = DateTime.UtcNow;
        Apply(draft, request);
        await db.SaveChangesAsync(cancellationToken);
        await LoadDraftReferencesAsync(draft, db, cancellationToken);
        return Results.Ok(ToResponse(draft));
    }

    private static async Task<IResult> ArchiveDraftAsync(Guid id, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var draft = await db.Drafts.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (draft is null) return Results.NotFound();
        draft.IsArchived = true; draft.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> GetWorkspaceAsync(ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var json = await db.FantasyWorkspaces.AsNoTracking().Where(x => x.UserId == UserId(principal)).Select(x => x.StateJson).SingleOrDefaultAsync(cancellationToken);
        return json is null ? Results.Ok(new { state = (object?)null }) : Results.Content($"{{\"state\":{json}}}", "application/json");
    }

    private static async Task<IResult> SaveWorkspaceAsync(WorkspaceRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (request.State.ValueKind != JsonValueKind.Object) return Validation("state", "Workspace state must be a JSON object.");
        var json = request.State.GetRawText();
        if (Encoding.UTF8.GetByteCount(json) > MaxWorkspaceBytes) return Results.Problem("The draft workspace is larger than 12 MB.", statusCode: 413);
        var userId = UserId(principal);
        var workspace = await db.FantasyWorkspaces.SingleOrDefaultAsync(x => x.UserId == userId, cancellationToken);
        if (workspace is null) { workspace = new FantasyWorkspace { UserId = userId, StateJson = json }; db.FantasyWorkspaces.Add(workspace); }
        else { workspace.StateJson = json; workspace.UpdatedAtUtc = DateTime.UtcNow; }
        await SyncWorkspaceRoomsAsync(request.State, userId, db, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> MatchPlayersAsync(PlayerMatchRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (request.Names.Count > 2_000) return Validation("names", "Match no more than 2,000 names at once.");
        var players = await db.Players.AsNoTracking().Include(x => x.League).Include(x => x.Aliases).Include(x => x.ExternalIds)
            .Where(x => request.LeagueAbbreviation == null || x.League.Abbreviation == request.LeagueAbbreviation).ToListAsync(cancellationToken);
        var lookup = new Dictionary<string, List<(Player Player, string Type)>>(StringComparer.Ordinal);
        foreach (var player in players)
        {
            Add(NormalizePlayerName(player.DisplayName ?? $"{player.FirstName} {player.LastName}"), player, "canonical");
            Add(NormalizePlayerName($"{player.FirstName} {player.LastName}"), player, "canonical");
            foreach (var alias in player.Aliases) Add(alias.NormalizedName, player, "alias");
            foreach (var external in player.ExternalIds.Where(x => x.SourceName != null)) Add(NormalizePlayerName(external.SourceName), player, "provider name");
        }
        var matches = request.Names.Select(name =>
        {
            var candidates = lookup.GetValueOrDefault(NormalizePlayerName(name))?.GroupBy(x => x.Player.Id).Select(x => x.First()).ToArray() ?? [];
            var match = candidates.Length == 1 ? candidates[0] : default;
            return new PlayerMatchResponse(name, candidates.Length == 1 ? match.Player.Id : null, candidates.Length == 1 ? match.Player.DisplayName ?? $"{match.Player.FirstName} {match.Player.LastName}" : null, candidates.Length == 1 ? match.Type : "unmatched", candidates.Length > 1);
        });
        return Results.Ok(matches);

        void Add(string key, Player player, string type) { if (key.Length == 0) return; if (!lookup.TryGetValue(key, out var list)) lookup[key] = list = []; list.Add((player, type)); }
    }

    private static async Task<IResult> ReconcilePlayersAsync(PlayerReconcileRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (request.Rows.Count > 2_000) return Validation("rows", "Import no more than 2,000 players at once.");
        if (request.Rows.Any(x => string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 220)) return Validation("rows", "Every player needs a name no longer than 220 characters.");

        var leagueAbbreviation = string.IsNullOrWhiteSpace(request.LeagueAbbreviation) ? "NBA" : request.LeagueAbbreviation.Trim().ToUpperInvariant();
        if (leagueAbbreviation.Length > 20) return Validation("leagueAbbreviation", "League abbreviation cannot exceed 20 characters.");
        var league = await EnsureLeagueAsync(leagueAbbreviation, db, cancellationToken);
        var players = await db.Players.Include(x => x.Team).Include(x => x.Aliases).Include(x => x.ExternalIds)
            .Where(x => x.LeagueId == league.Id).ToListAsync(cancellationToken);
        var lookup = BuildPlayerLookup(players);
        var teams = await db.Teams.Where(x => x.LeagueId == league.Id).ToDictionaryAsync(x => x.Abbreviation.ToUpper(), cancellationToken);
        var results = new List<PlayerReconcileResponse>(request.Rows.Count);

        foreach (var row in request.Rows)
        {
            var sourceName = row.Name.Trim();
            var normalized = NormalizePlayerName(sourceName);
            var candidates = lookup.GetValueOrDefault(normalized)?.GroupBy(x => x.Player.Id).Select(x => x.First()).ToArray() ?? [];
            Player player;
            string matchType;
            var created = false;
            if (candidates.Length == 1)
            {
                player = candidates[0].Player;
                matchType = candidates[0].Type;
            }
            else if (candidates.Length > 1)
            {
                return Results.Conflict(new { title = $"'{sourceName}' matches more than one player. Merge the duplicate records, then import again." });
            }
            else
            {
                var parts = sourceName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                var importedTeam = NormalizeTeamAbbreviation(row.TeamAbbreviation);
                var team = await ResolveTeamAsync(importedTeam, league, teams, db, cancellationToken);
                player = new Player
                {
                    FirstName = parts[0][..Math.Min(parts[0].Length, 100)],
                    LastName = parts.Length > 1 ? string.Join(' ', parts.Skip(1))[..Math.Min(string.Join(' ', parts.Skip(1)).Length, 100)] : string.Empty,
                    DisplayName = sourceName,
                    League = league,
                    Team = team,
                    Position = CleanPosition(row.Position)
                };
                db.Players.Add(player);
                players.Add(player);
                AddPlayerToLookup(lookup, player, "canonical");
                matchType = "created";
                created = true;
            }

            var imported = NormalizeTeamAbbreviation(row.TeamAbbreviation);
            var current = player.Team?.Abbreviation;
            var teamConflict = !created && imported is not null && current is not null && !string.Equals(imported, NormalizeTeamAbbreviation(current), StringComparison.OrdinalIgnoreCase);
            if (!created && imported is not null && current is null)
            {
                player.Team = await ResolveTeamAsync(imported, league, teams, db, cancellationToken);
                current = player.Team?.Abbreviation;
            }
            if (!created && string.IsNullOrWhiteSpace(player.Position)) player.Position = CleanPosition(row.Position);
            results.Add(new PlayerReconcileResponse(sourceName, player.Id, PlayerName(player), matchType, created, current, imported, teamConflict));
        }

        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(results);
    }

    private static async Task<IResult> UpdatePlayerTeamAsync(Guid id, PlayerTeamRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var player = await db.Players.Include(x => x.League).Include(x => x.Team).SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (player is null) return Results.NotFound();
        var abbreviation = NormalizeTeamAbbreviation(request.TeamAbbreviation);
        var teams = await db.Teams.Where(x => x.LeagueId == player.LeagueId).ToDictionaryAsync(x => x.Abbreviation.ToUpper(), cancellationToken);
        player.Team = await ResolveTeamAsync(abbreviation, player.League, teams, db, cancellationToken);
        player.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new CanonicalPlayerResponse(player.Id, PlayerName(player), player.League.Abbreviation, player.Team?.Abbreviation, player.Position));
    }

    private static async Task<IResult> MergePlayersAsync(PlayerMergeRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (request.DuplicatePlayerId == request.TargetPlayerId) return Validation("targetPlayerId", "Choose two different player records.");
        var duplicate = await db.Players.Include(x => x.Aliases).SingleOrDefaultAsync(x => x.Id == request.DuplicatePlayerId, cancellationToken);
        var target = await db.Players.Include(x => x.Aliases).Include(x => x.League).Include(x => x.Team).SingleOrDefaultAsync(x => x.Id == request.TargetPlayerId, cancellationToken);
        if (duplicate is null || target is null) return Results.NotFound();
        if (duplicate.LeagueId != target.LeagueId) return Results.Conflict(new { title = "Players from different leagues cannot be merged." });

        var targetNormalized = new HashSet<string>(target.Aliases.Select(x => x.NormalizedName), StringComparer.Ordinal) { NormalizePlayerName(PlayerName(target)) };
        var namesToKeep = duplicate.Aliases.Select(x => (x.Name, x.NormalizedName)).Append((PlayerName(duplicate), NormalizePlayerName(PlayerName(duplicate)))).ToArray();
        foreach (var (name, normalized) in namesToKeep.Where(x => x.Item2.Length > 0 && !targetNormalized.Contains(x.Item2)))
        {
            db.PlayerAliases.Add(new PlayerAlias { PlayerId = target.Id, Name = name, NormalizedName = normalized });
            targetNormalized.Add(normalized);
        }

        await db.PlayerProjections.Where(x => x.PlayerId == duplicate.Id).ExecuteUpdateAsync(x => x.SetProperty(y => y.PlayerId, target.Id), cancellationToken);
        await db.DraftPicks.Where(x => x.PlayerId == duplicate.Id).ExecuteUpdateAsync(x => x.SetProperty(y => y.PlayerId, target.Id), cancellationToken);
        await db.PlayerExternalIds.Where(x => x.PlayerId == duplicate.Id).ExecuteUpdateAsync(x => x.SetProperty(y => y.PlayerId, target.Id), cancellationToken);
        db.PlayerAliases.RemoveRange(duplicate.Aliases);
        db.Players.Remove(duplicate);
        target.UpdatedAtUtc = DateTime.UtcNow;

        var workspaces = await db.FantasyWorkspaces.ToListAsync(cancellationToken);
        foreach (var workspace in workspaces)
        {
            var state = JsonNode.Parse(workspace.StateJson);
            var changed = false;
            if (state?["sources"] is JsonArray sources)
            {
                foreach (var source in sources.OfType<JsonObject>())
                foreach (var player in (source["players"] as JsonArray)?.OfType<JsonObject>() ?? [])
                {
                    if (!Guid.TryParse(player["canonicalPlayerId"]?.GetValue<string>(), out var playerId) || playerId != duplicate.Id) continue;
                    player["canonicalPlayerId"] = target.Id.ToString(); player["canonicalName"] = PlayerName(target); player["canonicalMatchType"] = "merged alias"; changed = true;
                }
            }
            if (changed) { workspace.StateJson = state!.ToJsonString(); workspace.UpdatedAtUtc = DateTime.UtcNow; }
        }

        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new CanonicalPlayerResponse(target.Id, PlayerName(target), target.League.Abbreviation, target.Team?.Abbreviation, target.Position));
    }

    private static async Task<IResult> GetAliasesAsync(SportsHubDbContext db, string? search = null, CancellationToken cancellationToken = default)
    {
        var query = db.PlayerAliases.AsNoTracking().Include(x => x.Player).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim(); query = query.Where(x => x.Name.Contains(term) || x.Player.FirstName.Contains(term) || x.Player.LastName.Contains(term) || (x.Player.DisplayName != null && x.Player.DisplayName.Contains(term))); }
        var aliases = await query.OrderBy(x => x.Player.LastName).ThenBy(x => x.Name).Take(200).ToListAsync(cancellationToken);
        return Results.Ok(aliases.Select(x => new PlayerAliasResponse(x.Id, x.PlayerId, x.Player.DisplayName ?? $"{x.Player.FirstName} {x.Player.LastName}", x.Name, x.NormalizedName)));
    }

    private static async Task<IResult> CreateCanonicalPlayerAsync(CanonicalPlayerRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var first = request.FirstName.Trim(); var last = request.LastName.Trim(); var display = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
        if (first.Length is < 1 or > 100) return Validation("firstName", "Enter a first name up to 100 characters.");
        if (last.Length is < 1 or > 100) return Validation("lastName", "Enter a last name up to 100 characters.");
        if (display?.Length > 220) return Validation("displayName", "Display name cannot exceed 220 characters.");
        if (request.TeamAbbreviation?.Trim().Length > 20) return Validation("teamAbbreviation", "Team abbreviation cannot exceed 20 characters.");
        if (request.Position?.Trim().Length > 30) return Validation("position", "Position cannot exceed 30 characters.");

        var sport = await db.Sports.SingleOrDefaultAsync(x => x.Slug == "basketball", cancellationToken);
        if (sport is null) { sport = new Sport { Name = "Basketball", Slug = "basketball" }; db.Sports.Add(sport); }
        var league = await db.Leagues.SingleOrDefaultAsync(x => x.Abbreviation == "NBA", cancellationToken);
        if (league is null) { league = new League { Name = "National Basketball Association", Abbreviation = "NBA", Sport = sport }; db.Leagues.Add(league); }

        var normalized = NormalizePlayerName(display ?? $"{first} {last}");
        var existingNames = await db.Players.AsNoTracking().Where(x => x.LeagueId == league.Id).Select(x => new { x.FirstName, x.LastName, x.DisplayName }).ToListAsync(cancellationToken);
        if (existingNames.Any(x => NormalizePlayerName(x.DisplayName ?? $"{x.FirstName} {x.LastName}") == normalized)) return Results.Conflict(new { title = "That canonical NBA player already exists." });

        Team? team = null;
        var abbreviation = NormalizeTeamAbbreviation(request.TeamAbbreviation);
        if (!string.IsNullOrWhiteSpace(abbreviation))
        {
            var teams = await db.Teams.Where(x => x.LeagueId == league.Id).ToDictionaryAsync(x => x.Abbreviation.ToUpper(), cancellationToken);
            team = await ResolveTeamAsync(abbreviation, league, teams, db, cancellationToken);
        }
        var player = new Player { FirstName = first, LastName = last, DisplayName = display, League = league, Team = team, Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim() };
        db.Players.Add(player); await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/players/{player.Id}", new CanonicalPlayerResponse(player.Id, player.DisplayName ?? $"{player.FirstName} {player.LastName}", "NBA", team?.Abbreviation, player.Position));
    }

    private static async Task<IResult> CreateAliasAsync(PlayerAliasRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim(); var normalized = NormalizePlayerName(name);
        if (name.Length is < 2 or > 220 || normalized.Length == 0) return Validation("name", "Enter an alias between 2 and 220 characters.");
        var player = await db.Players.SingleOrDefaultAsync(x => x.Id == request.PlayerId, cancellationToken);
        if (player is null) return Validation("playerId", "Select an existing player.");
        if (await db.PlayerAliases.AnyAsync(x => x.PlayerId == request.PlayerId && x.NormalizedName == normalized, cancellationToken)) return Results.Conflict(new { title = "That alias already belongs to this player." });
        var alias = new PlayerAlias { PlayerId = player.Id, Name = name, NormalizedName = normalized };
        db.PlayerAliases.Add(alias); await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/fantasy/player-aliases/{alias.Id}", new PlayerAliasResponse(alias.Id, player.Id, player.DisplayName ?? $"{player.FirstName} {player.LastName}", alias.Name, alias.NormalizedName));
    }

    private static async Task<IResult> DeleteAliasAsync(Guid id, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var alias = await db.PlayerAliases.FindAsync([id], cancellationToken);
        if (alias is null) return Results.NotFound();
        db.PlayerAliases.Remove(alias); await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    public static string NormalizePlayerName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var decomposed = value.Trim().Normalize(NormalizationForm.FormD); var builder = new StringBuilder(decomposed.Length);
        foreach (var character in decomposed) if (CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(character)) builder.Append(char.ToLowerInvariant(character));
        return builder.ToString();
    }

    private static Dictionary<string, List<(Player Player, string Type)>> BuildPlayerLookup(IEnumerable<Player> players)
    {
        var lookup = new Dictionary<string, List<(Player Player, string Type)>>(StringComparer.Ordinal);
        foreach (var player in players) AddPlayerToLookup(lookup, player, "canonical");
        return lookup;
    }

    private static void AddPlayerToLookup(Dictionary<string, List<(Player Player, string Type)>> lookup, Player player, string canonicalType)
    {
        Add(NormalizePlayerName(player.DisplayName ?? PlayerName(player)), canonicalType);
        Add(NormalizePlayerName($"{player.FirstName} {player.LastName}"), canonicalType);
        foreach (var alias in player.Aliases) Add(alias.NormalizedName, "alias");
        foreach (var external in player.ExternalIds.Where(x => x.SourceName != null)) Add(NormalizePlayerName(external.SourceName), "provider name");
        void Add(string key, string type) { if (key.Length == 0) return; if (!lookup.TryGetValue(key, out var list)) lookup[key] = list = []; list.Add((player, type)); }
    }

    private static async Task<League> EnsureLeagueAsync(string abbreviation, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var league = await db.Leagues.Include(x => x.Sport).SingleOrDefaultAsync(x => x.Abbreviation == abbreviation, cancellationToken);
        if (league is not null) return league;
        var sport = await db.Sports.SingleOrDefaultAsync(x => x.Slug == "basketball", cancellationToken);
        if (sport is null) { sport = new Sport { Name = "Basketball", Slug = "basketball" }; db.Sports.Add(sport); }
        league = new League { Name = abbreviation == "NBA" ? "National Basketball Association" : abbreviation, Abbreviation = abbreviation, Sport = sport };
        db.Leagues.Add(league);
        return league;
    }

    private static async Task<Team?> ResolveTeamAsync(string? abbreviation, League league, Dictionary<string, Team> teams, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (abbreviation is null) return null;
        if (teams.TryGetValue(abbreviation, out var existing)) return existing;
        existing = teams.Values.FirstOrDefault(x => string.Equals(NormalizeTeamAbbreviation(x.Abbreviation), abbreviation, StringComparison.Ordinal));
        if (existing is not null) return existing;
        var team = await db.Teams.SingleOrDefaultAsync(x => x.LeagueId == league.Id && x.Abbreviation == abbreviation, cancellationToken);
        if (team is null) { team = new Team { Name = abbreviation, Abbreviation = abbreviation, League = league }; db.Teams.Add(team); }
        teams[abbreviation] = team;
        return team;
    }

    public static string? NormalizeTeamAbbreviation(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var team = new string(value.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        if (team.Length > 20) team = team[..20];
        return team switch
        {
            "BRK" or "BK" => "BKN",
            "CHO" => "CHA",
            "GS" => "GSW",
            "NO" or "NOH" or "NOR" => "NOP",
            "NY" => "NYK",
            "PHO" => "PHX",
            "SA" => "SAS",
            "UTAH" => "UTA",
            "WSH" => "WAS",
            _ => team
        };
    }

    private static string? CleanPosition(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, 30)];
    private static string PlayerName(Player player) => player.DisplayName ?? $"{player.FirstName} {player.LastName}".Trim();

    private static async Task<IResult?> ValidateDraftAsync(FantasyDraftRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 160) errors["name"] = ["Enter a draft name up to 160 characters."];
        if (string.IsNullOrWhiteSpace(request.SportName) || request.SportName.Trim().Length > 80) errors["sportName"] = ["Enter a sport up to 80 characters."];
        if (request.EntrantCount is < 2 or > 100_000) errors["entrantCount"] = ["Entrants must be between 2 and 100,000."];
        if (request.DraftSlot is < 1 || request.DraftSlot > request.EntrantCount) errors["draftSlot"] = ["Draft slot must be within the entrant count."];
        if (request.RoundCount is < 1 or > 100) errors["roundCount"] = ["Rounds must be between 1 and 100."];
        if (request.BuyIn < 0 || request.BuyIn > 10_000_000) errors["buyIn"] = ["Buy-in must be between 0 and 10,000,000."];
        if (request.Winnings is < 0 or > 1_000_000_000) errors["winnings"] = ["Winnings must be between 0 and 1,000,000,000."];
        if (request.FinishingPlace is < 1 || request.FinishingPlace > request.EntrantCount) errors["finishingPlace"] = ["Finishing place must be within the entrant count."];
        if (request.Notes?.Length > 2_000) errors["notes"] = ["Notes cannot exceed 2,000 characters."];
        if (!await db.BettingPlatforms.AnyAsync(x => x.Id == request.PlatformId && x.IsActive, cancellationToken)) errors["platformId"] = ["Select an active platform."];
        if (request.LeagueId is not null && !await db.Leagues.AnyAsync(x => x.Id == request.LeagueId, cancellationToken)) errors["leagueId"] = ["Select an existing league."];
        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }

    private static void Apply(Draft draft, FantasyDraftRequest request)
    {
        draft.Status = request.Status; draft.ScheduledAtUtc = request.ScheduledAtUtc?.ToUniversalTime(); draft.StartedAtUtc = request.StartedAtUtc?.ToUniversalTime(); draft.CompletedAtUtc = request.CompletedAtUtc?.ToUniversalTime();
        draft.EntrantCount = request.EntrantCount; draft.DraftSlot = request.DraftSlot; draft.RoundCount = request.RoundCount; draft.BuyIn = decimal.Round(request.BuyIn, 2, MidpointRounding.AwayFromZero); draft.FinishingPlace = request.FinishingPlace;
        draft.Winnings = request.Winnings is null ? null : decimal.Round(request.Winnings.Value, 2, MidpointRounding.AwayFromZero); draft.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
    }

    private static async Task LoadDraftReferencesAsync(Draft draft, SportsHubDbContext db, CancellationToken cancellationToken) { await db.Entry(draft).Reference(x => x.Platform).LoadAsync(cancellationToken); if (draft.LeagueId is not null) await db.Entry(draft).Reference(x => x.League).LoadAsync(cancellationToken); }

    private static async Task SyncWorkspaceRoomsAsync(JsonElement state, string userId, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (!state.TryGetProperty("rooms", out var rooms) || rooms.ValueKind != JsonValueKind.Array) return;
        var platforms = await db.BettingPlatforms.Where(x => x.IsActive).ToDictionaryAsync(x => x.Name.ToLower(), cancellationToken);
        var tracked = await db.Drafts.Where(x => x.UserId == userId && x.WorkspaceRoomId != null).ToDictionaryAsync(x => x.WorkspaceRoomId!, cancellationToken);
        foreach (var room in rooms.EnumerateArray())
        {
            if (!room.TryGetProperty("id", out var idValue) || !room.TryGetProperty("platform", out var platformValue)) continue;
            var roomId = idValue.GetString(); var platformName = platformValue.GetString();
            if (string.IsNullOrWhiteSpace(roomId) || roomId.Length > 100 || string.IsNullOrWhiteSpace(platformName) || !platforms.TryGetValue(platformName.ToLower(), out var platform)) continue;
            var name = room.TryGetProperty("name", out var nameValue) ? nameValue.GetString() : null;
            var config = room.TryGetProperty("config", out var configValue) ? configValue : default;
            var teams = ReadInt(config, "teams") is { } teamValue ? Math.Clamp(teamValue, 2, 30) : 12;
            var slot = ReadInt(config, "slot") is { } slotValue ? Math.Clamp(slotValue, 1, teams) : (int?)null;
            var rounds = ReadInt(config, "rounds") is { } roundValue ? Math.Clamp(roundValue, 1, 50) : (int?)null;
            var pickCount = room.TryGetProperty("picks", out var picksValue) && picksValue.ValueKind == JsonValueKind.Array ? picksValue.GetArrayLength() : 0;
            var status = pickCount == 0 ? DraftStatus.Scheduled : rounds is not null && pickCount >= teams * rounds ? DraftStatus.Active : DraftStatus.InProgress;
            if (!tracked.TryGetValue(roomId, out var draft))
            {
                draft = new Draft { UserId = userId, WorkspaceRoomId = roomId, Name = DraftName(name, platformName), SportName = "Basketball", PlatformId = platform.Id, Status = status, EntrantCount = teams, DraftSlot = slot, RoundCount = rounds, BuyIn = 0m, StartedAtUtc = pickCount > 0 ? DateTime.UtcNow : null };
                db.Drafts.Add(draft); tracked[roomId] = draft;
            }
            else
            {
                draft.Name = DraftName(name, platformName); draft.PlatformId = platform.Id; draft.EntrantCount = teams; draft.DraftSlot = slot; draft.RoundCount = rounds;
                if (draft.Status is not (DraftStatus.Completed or DraftStatus.Cancelled)) draft.Status = status;
                if (pickCount > 0 && draft.StartedAtUtc is null) draft.StartedAtUtc = DateTime.UtcNow;
                draft.UpdatedAtUtc = DateTime.UtcNow;
            }
        }

        static int? ReadInt(JsonElement element, string property) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.TryGetInt32(out var parsed) ? parsed : null;
        static string DraftName(string? name, string platformName) { var value = string.IsNullOrWhiteSpace(name) ? $"{platformName} draft" : name.Trim(); return value[..Math.Min(value.Length, 160)]; }
    }

    private static FantasyDraftResponse ToResponse(Draft x) => new(x.Id, x.Name, x.SportName, x.PlatformId, x.Platform.Name, x.LeagueId, x.League?.Abbreviation, x.Status, x.ScheduledAtUtc, x.StartedAtUtc, x.CompletedAtUtc, x.EntrantCount, x.DraftSlot, x.RoundCount, x.BuyIn, x.FinishingPlace, x.Winnings, x.ProfitLoss, x.CurrencyCode, x.Notes, x.IsArchived);
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
