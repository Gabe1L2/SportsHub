using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SportsHub.Api.Infrastructure;
using SportsHub.Domain.Betting;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Betting;

public sealed class BetListQuery
{
    public string? Search { get; init; }
    public BetStatus? Status { get; init; }
    public BetTiming? Timing { get; init; }
    public Guid? PlatformId { get; init; }
    public Guid? SourceId { get; init; }
    public bool Archived { get; init; }
    public string Sort { get; init; } = "placedDesc";
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}

public sealed record BetPayoutTierRequest(int RequiredCorrectLegs, decimal? BasePayoutAmount, decimal FinalPayoutAmount);
public sealed record BetBonusRequest(BetBonusType Type, decimal? Percentage, decimal? FixedAmount, string? Description);
public sealed record BetUpsertRequest(
    Guid PlatformId,
    Guid? SourceId,
    Guid? BankrollAccountId,
    decimal EntryCost,
    decimal EntryValue,
    int LegCount,
    BetPayoutMode PayoutMode,
    decimal? DecimalOdds,
    decimal? EstimatedProbability,
    BetTiming Timing,
    DateTime? PlacedAtUtc,
    string? CurrencyCode,
    string? Notes,
    BetBonusRequest? Bonus,
    IReadOnlyList<BetPayoutTierRequest>? PayoutTiers);

public sealed record SettleBetRequest(BetStatus Status, decimal ActualPayout, int? CorrectLegCount, DateTime? SettledAtUtc);
public sealed record PlatformRequest(string Name, BettingPlatformType Type, bool IsActive = true);
public sealed record SourceRequest(string Name, BetSourceType Type, bool IsActive = true);
public sealed record PlatformResponse(Guid Id, string Name, BettingPlatformType Type, bool IsActive);
public sealed record SourceResponse(Guid Id, string Name, BetSourceType Type, bool IsActive);
public sealed record BetBonusResponse(Guid Id, BetBonusType Type, decimal? Percentage, decimal? FixedAmount, string? Description);
public sealed record BetPayoutTierResponse(Guid Id, int RequiredCorrectLegs, decimal BasePayoutAmount, decimal FinalPayoutAmount);
public sealed record BetResponse(
    Guid Id,
    PlatformResponse Platform,
    SourceResponse? Source,
    Guid? BankrollAccountId,
    decimal EntryCost,
    decimal EntryValue,
    int LegCount,
    BetPayoutMode PayoutMode,
    decimal? DecimalOdds,
    decimal? EstimatedProbability,
    BetTiming Timing,
    BetStatus Status,
    int? CorrectLegCount,
    decimal? ExpectedPayout,
    decimal? ActualPayout,
    decimal? ProfitLoss,
    string CurrencyCode,
    string? Notes,
    DateTime PlacedAtUtc,
    DateTime? SettledAtUtc,
    bool IsArchived,
    DateTime? ArchivedAtUtc,
    BetBonusResponse? Bonus,
    IReadOnlyList<BetPayoutTierResponse> PayoutTiers);

public sealed record BettingSummaryResponse(int TotalBets, int PendingBets, decimal TotalEntryCost, decimal NetProfit, decimal? Roi);
public sealed record BetListResponse(BettingSummaryResponse Summary, IReadOnlyList<BetResponse> Items, int TotalCount, int Page, int PageSize);
public sealed record BettingLookupsResponse(IReadOnlyList<PlatformResponse> Platforms, IReadOnlyList<SourceResponse> Sources);

public static class BettingEndpoints
{
    public static IEndpointRouteBuilder MapBettingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/betting").WithTags("Betting").RequireAuthorization();

        group.MapGet("/summary", GetSummaryAsync);
        group.MapGet("/bets", GetBetsAsync);
        group.MapGet("/bets/{id:guid}", GetBetAsync);
        group.MapPost("/bets", CreateBetAsync).ValidateAntiforgery();
        group.MapPut("/bets/{id:guid}", UpdateBetAsync).ValidateAntiforgery();
        group.MapPost("/bets/{id:guid}/settle", SettleBetAsync).ValidateAntiforgery();
        group.MapPost("/bets/{id:guid}/archive", (Guid id, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken) => SetArchivedAsync(id, true, principal, db, cancellationToken)).ValidateAntiforgery();
        group.MapPost("/bets/{id:guid}/restore", (Guid id, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken) => SetArchivedAsync(id, false, principal, db, cancellationToken)).ValidateAntiforgery();

        group.MapGet("/lookups", GetLookupsAsync);
        group.MapPost("/platforms", CreatePlatformAsync).RequireAuthorization("AdminOnly").ValidateAntiforgery();
        group.MapPut("/platforms/{id:guid}", UpdatePlatformAsync).RequireAuthorization("AdminOnly").ValidateAntiforgery();
        group.MapPost("/sources", CreateSourceAsync).ValidateAntiforgery();
        group.MapPut("/sources/{id:guid}", UpdateSourceAsync).ValidateAntiforgery();
        group.MapBetCsvImportEndpoints();
        return endpoints;
    }

    private static async Task<IResult> GetSummaryAsync(ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var summary = await BuildSummaryAsync(UserId(principal), db, cancellationToken);
        return Results.Ok(new { summary.TotalBets, summary.PendingBets, message = "Track entries, payouts, results, and performance." });
    }

    private static async Task<IResult> GetBetsAsync(ClaimsPrincipal principal, SportsHubDbContext db, [AsParameters] BetListQuery query, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var page = Math.Max(query.Page, 1);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var bets = db.Bets.AsNoTracking().Include(x => x.Platform).Include(x => x.Source).Include(x => x.Bonus).Include(x => x.PayoutTiers)
            .Where(x => x.UserId == userId && x.IsArchived == query.Archived);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            bets = bets.Where(x => x.Platform.Name.Contains(search) || (x.Source != null && x.Source.Name.Contains(search)) || (x.Notes != null && x.Notes.Contains(search)));
        }
        if (query.Status is not null) bets = bets.Where(x => x.Status == query.Status);
        if (query.Timing is not null) bets = bets.Where(x => x.Timing == query.Timing);
        if (query.PlatformId is not null) bets = bets.Where(x => x.PlatformId == query.PlatformId);
        if (query.SourceId is not null) bets = bets.Where(x => x.SourceId == query.SourceId);
        bets = query.Sort switch
        {
            "placedAsc" => bets.OrderBy(x => x.PlacedAtUtc),
            "entryDesc" => bets.OrderByDescending(x => x.EntryCost).ThenByDescending(x => x.PlacedAtUtc),
            "entryAsc" => bets.OrderBy(x => x.EntryCost).ThenByDescending(x => x.PlacedAtUtc),
            "status" => bets.OrderBy(x => x.Status).ThenByDescending(x => x.PlacedAtUtc),
            _ => bets.OrderByDescending(x => x.PlacedAtUtc)
        };

        var totalCount = await bets.CountAsync(cancellationToken);
        var items = await bets.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        var summary = await BuildSummaryAsync(userId, db, cancellationToken);
        return Results.Ok(new BetListResponse(summary, items.Select(ToResponse).ToArray(), totalCount, page, pageSize));
    }

    private static async Task<IResult> GetBetAsync(Guid id, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var bet = await BetForUser(db, id, UserId(principal), tracking: false).SingleOrDefaultAsync(cancellationToken);
        return bet is null ? Results.NotFound() : Results.Ok(ToResponse(bet));
    }

    private static async Task<IResult> CreateBetAsync(BetUpsertRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var validation = await ValidateAsync(request, userId, db, cancellationToken);
        if (validation.Errors.Count > 0) return Results.ValidationProblem(validation.Errors);
        var now = DateTime.UtcNow;
        var bet = new Bet { UserId = userId, CreatedAtUtc = now, UpdatedAtUtc = now };
        ApplyRequest(bet, request, validation.DecimalOdds, now);
        AddPayoutTiers(bet, validation.Tiers);
        db.Bets.Add(bet);
        await db.SaveChangesAsync(cancellationToken);
        var created = await BetForUser(db, bet.Id, userId, tracking: false).SingleAsync(cancellationToken);
        return Results.Created($"/api/betting/bets/{bet.Id}", ToResponse(created));
    }

    private static async Task<IResult> UpdateBetAsync(Guid id, BetUpsertRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var bet = await db.Bets.Include(x => x.Bonus).Include(x => x.PayoutTiers)
            .SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);
        if (bet is null) return Results.NotFound();
        if (bet.IsArchived) return Results.Conflict(new { title = "Restore this bet before editing it." });
        var validation = await ValidateAsync(request, userId, db, cancellationToken);
        if (validation.Errors.Count > 0) return Results.ValidationProblem(validation.Errors);

        ReconcilePayoutTiers(bet, validation.Tiers, db);
        if (bet.Bonus is not null && request.Bonus is null) { db.BetBonuses.Remove(bet.Bonus); bet.Bonus = null; }
        ApplyRequest(bet, request, validation.DecimalOdds, DateTime.UtcNow);
        try { await db.SaveChangesAsync(cancellationToken); }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { title = "This bet changed while you were editing it. Reload the page and try again." });
        }
        var updated = await BetForUser(db, id, userId, tracking: false).SingleAsync(cancellationToken);
        return Results.Ok(ToResponse(updated));
    }

    private static async Task<IResult> SettleBetAsync(Guid id, SettleBetRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var bet = await db.Bets.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (bet is null) return Results.NotFound();
        if (bet.IsArchived) return Results.Conflict(new { title = "Restore this bet before settling it." });
        try { bet.Settle(request.Status, request.ActualPayout, request.CorrectLegCount, request.SettledAtUtc?.ToUniversalTime() ?? DateTime.UtcNow); }
        catch (ArgumentException exception) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["settlement"] = [exception.Message] }); }
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new { bet.Id, bet.Status, bet.ActualPayout, bet.CorrectLegCount, bet.SettledAtUtc, bet.ActualProfitLoss });
    }

    private static async Task<IResult> SetArchivedAsync(Guid id, bool archived, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var bet = await db.Bets.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (bet is null) return Results.NotFound();
        bet.SetArchived(archived, DateTime.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> GetLookupsAsync(ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var platforms = await db.BettingPlatforms.AsNoTracking().OrderByDescending(x => x.IsActive).ThenBy(x => x.Name).Select(x => new PlatformResponse(x.Id, x.Name, x.Type, x.IsActive)).ToListAsync(cancellationToken);
        var sources = await db.BetSources.AsNoTracking().Where(x => x.UserId == userId).OrderByDescending(x => x.IsActive).ThenBy(x => x.Name).Select(x => new SourceResponse(x.Id, x.Name, x.Type, x.IsActive)).ToListAsync(cancellationToken);
        return Results.Ok(new BettingLookupsResponse(platforms, sources));
    }

    private static async Task<IResult> CreatePlatformAsync(PlatformRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 120) return NameValidation("platform", 120);
        if (await db.BettingPlatforms.AnyAsync(x => x.Name == name, cancellationToken)) return Results.Conflict(new { title = "A platform with that name already exists." });
        var platform = new BettingPlatform { Name = name, Type = request.Type, IsActive = request.IsActive };
        db.BettingPlatforms.Add(platform);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/betting/platforms/{platform.Id}", new PlatformResponse(platform.Id, platform.Name, platform.Type, platform.IsActive));
    }

    private static async Task<IResult> UpdatePlatformAsync(Guid id, PlatformRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var platform = await db.BettingPlatforms.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (platform is null) return Results.NotFound();
        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 120) return NameValidation("platform", 120);
        if (await db.BettingPlatforms.AnyAsync(x => x.Id != id && x.Name == name, cancellationToken)) return Results.Conflict(new { title = "A platform with that name already exists." });
        platform.Name = name; platform.Type = request.Type; platform.IsActive = request.IsActive;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new PlatformResponse(platform.Id, platform.Name, platform.Type, platform.IsActive));
    }

    private static async Task<IResult> CreateSourceAsync(SourceRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal); var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 160) return NameValidation("source", 160);
        if (await db.BetSources.AnyAsync(x => x.UserId == userId && x.Name == name, cancellationToken)) return Results.Conflict(new { title = "A source with that name already exists." });
        var now = DateTime.UtcNow;
        var source = new BetSource { UserId = userId, Name = name, Type = request.Type, IsActive = request.IsActive, CreatedAtUtc = now, UpdatedAtUtc = now };
        db.BetSources.Add(source);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/betting/sources/{source.Id}", new SourceResponse(source.Id, source.Name, source.Type, source.IsActive));
    }

    private static async Task<IResult> UpdateSourceAsync(Guid id, SourceRequest request, ClaimsPrincipal principal, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var userId = UserId(principal);
        var source = await db.BetSources.SingleOrDefaultAsync(x => x.Id == id && x.UserId == userId, cancellationToken);
        if (source is null) return Results.NotFound();
        var name = request.Name?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 160) return NameValidation("source", 160);
        if (await db.BetSources.AnyAsync(x => x.UserId == userId && x.Id != id && x.Name == name, cancellationToken)) return Results.Conflict(new { title = "A source with that name already exists." });
        source.Name = name; source.Type = request.Type; source.IsActive = request.IsActive; source.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(new SourceResponse(source.Id, source.Name, source.Type, source.IsActive));
    }

    private static IQueryable<Bet> BetForUser(SportsHubDbContext db, Guid id, string userId, bool tracking)
    {
        var query = db.Bets.Include(x => x.Platform).Include(x => x.Source).Include(x => x.Bonus).Include(x => x.PayoutTiers).Where(x => x.Id == id && x.UserId == userId);
        return tracking ? query : query.AsNoTracking();
    }

    private static async Task<BettingSummaryResponse> BuildSummaryAsync(string userId, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var bets = db.Bets.AsNoTracking().Where(x => x.UserId == userId && !x.IsArchived);
        var totalBets = await bets.CountAsync(cancellationToken);
        var pendingBets = await bets.CountAsync(x => x.Status == BetStatus.Pending, cancellationToken);
        var totalEntryCost = await bets.SumAsync(x => (decimal?)x.EntryCost, cancellationToken) ?? 0m;
        var settled = bets.Where(x => x.Status != BetStatus.Pending && x.ActualPayout != null);
        var settledEntryCost = await settled.SumAsync(x => (decimal?)x.EntryCost, cancellationToken) ?? 0m;
        var totalReturned = await settled.SumAsync(x => x.ActualPayout, cancellationToken) ?? 0m;
        var netProfit = totalReturned - settledEntryCost;
        return new BettingSummaryResponse(totalBets, pendingBets, totalEntryCost, netProfit, settledEntryCost == 0 ? null : netProfit / settledEntryCost);
    }

    private static async Task<ValidatedBetRequest> ValidateAsync(BetUpsertRequest request, string userId, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.EntryCost < 0) errors["entryCost"] = ["Entry cost cannot be negative."];
        if (request.EntryValue <= 0) errors["entryValue"] = ["Entry value must be greater than zero, including for a free entry."];
        if (request.LegCount is < 1 or > 100) errors["legCount"] = ["Leg count must be between 1 and 100."];
        if (request.DecimalOdds is <= 0) errors["decimalOdds"] = ["Decimal odds must be greater than zero."];
        if (request.EstimatedProbability is < 0 or > 1) errors["estimatedProbability"] = ["Estimated probability must be between 0 and 1."];
        if ((request.CurrencyCode?.Trim().Length ?? 3) != 3) errors["currencyCode"] = ["Currency code must contain three letters."];
        if (request.Notes?.Length > 2000) errors["notes"] = ["Notes cannot exceed 2,000 characters."];
        if (!await db.BettingPlatforms.AnyAsync(x => x.Id == request.PlatformId, cancellationToken)) errors["platformId"] = ["Select a valid platform."];
        if (request.SourceId is not null && !await db.BetSources.AnyAsync(x => x.Id == request.SourceId && x.UserId == userId, cancellationToken)) errors["sourceId"] = ["Select a valid source."];
        if (request.BankrollAccountId is not null && !await db.BankrollAccounts.AnyAsync(x => x.Id == request.BankrollAccountId && x.UserId == userId, cancellationToken)) errors["bankrollAccountId"] = ["Select a valid bankroll account."];

        var tiers = (request.PayoutTiers ?? []).Select(x => new BetPayoutTierRequest(x.RequiredCorrectLegs, x.BasePayoutAmount ?? x.FinalPayoutAmount, x.FinalPayoutAmount)).ToList();
        if (tiers.Count == 0 && request.DecimalOdds is > 0 && request.EntryValue > 0)
        {
            var payout = decimal.Round(request.EntryValue * request.DecimalOdds.Value, 2, MidpointRounding.AwayFromZero);
            tiers.Add(new BetPayoutTierRequest(request.LegCount, payout, payout));
        }
        if (tiers.Count == 0) errors["payoutTiers"] = ["Enter odds or at least one payout amount."];
        if (request.PayoutMode == BetPayoutMode.AllOrNothing && (tiers.Count != 1 || tiers[0].RequiredCorrectLegs != request.LegCount)) errors["payoutTiers"] = ["An all-or-nothing bet must have one payout for all legs being correct."];
        if (request.PayoutMode == BetPayoutMode.Flex && tiers.All(x => x.RequiredCorrectLegs != request.LegCount)) errors["payoutTiers"] = ["A flex bet must include a payout for all legs being correct."];
        if (tiers.Any(x => x.RequiredCorrectLegs < 0 || x.RequiredCorrectLegs > request.LegCount)) errors["payoutTiers"] = ["Every payout tier must use a correct-leg count between zero and the total leg count."];
        if (tiers.GroupBy(x => x.RequiredCorrectLegs).Any(x => x.Count() > 1)) errors["payoutTiers"] = ["Only one payout is allowed for each correct-leg count."];
        if (tiers.Any(x => x.BasePayoutAmount < 0 || x.FinalPayoutAmount < 0)) errors["payoutTiers"] = ["Payout amounts cannot be negative."];
        if (request.Bonus is not null)
        {
            if (request.Bonus.Percentage is < 0) errors["bonus.percentage"] = ["Bonus percentage cannot be negative."];
            if (request.Bonus.FixedAmount is < 0) errors["bonus.fixedAmount"] = ["Bonus amount cannot be negative."];
            if (request.Bonus.Description?.Length > 1000) errors["bonus.description"] = ["Bonus description cannot exceed 1,000 characters."];
        }

        decimal? decimalOdds = request.DecimalOdds;
        var fullTier = tiers.SingleOrDefault(x => x.RequiredCorrectLegs == request.LegCount);
        if (decimalOdds is null && fullTier is not null && request.EntryValue > 0) decimalOdds = BetPricing.DecimalOddsFromPayout(request.EntryValue, fullTier.FinalPayoutAmount);
        return new ValidatedBetRequest(errors, tiers, decimalOdds);
    }

    private static void ApplyRequest(Bet bet, BetUpsertRequest request, decimal? decimalOdds, DateTime now)
    {
        bet.PlatformId = request.PlatformId; bet.SourceId = request.SourceId; bet.BankrollAccountId = request.BankrollAccountId;
        bet.EntryCost = request.EntryCost; bet.EntryValue = request.EntryValue; bet.LegCount = request.LegCount; bet.PayoutMode = request.PayoutMode;
        bet.DecimalOdds = decimalOdds; bet.EstimatedProbability = request.EstimatedProbability; bet.Timing = request.Timing;
        bet.CurrencyCode = string.IsNullOrWhiteSpace(request.CurrencyCode) ? "USD" : request.CurrencyCode.Trim().ToUpperInvariant();
        bet.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        bet.PlacedAtUtc = request.PlacedAtUtc?.ToUniversalTime() ?? now; bet.UpdatedAtUtc = now;
        if (request.Bonus is null) return;
        bet.Bonus ??= new BetBonus(); bet.Bonus.Type = request.Bonus.Type; bet.Bonus.Percentage = request.Bonus.Percentage; bet.Bonus.FixedAmount = request.Bonus.FixedAmount;
        bet.Bonus.Description = string.IsNullOrWhiteSpace(request.Bonus.Description) ? null : request.Bonus.Description.Trim();
    }

    private static void AddPayoutTiers(Bet bet, IEnumerable<BetPayoutTierRequest> tiers)
    {
        foreach (var tier in tiers.OrderBy(x => x.RequiredCorrectLegs))
            bet.PayoutTiers.Add(NewPayoutTier(tier));
    }

    private static void ReconcilePayoutTiers(Bet bet, IEnumerable<BetPayoutTierRequest> requestedTiers, SportsHubDbContext db)
    {
        var existingByCorrectLegs = bet.PayoutTiers.ToDictionary(x => x.RequiredCorrectLegs);
        foreach (var requested in requestedTiers)
        {
            if (existingByCorrectLegs.Remove(requested.RequiredCorrectLegs, out var existing))
            {
                existing.BasePayoutAmount = requested.BasePayoutAmount ?? requested.FinalPayoutAmount;
                existing.FinalPayoutAmount = requested.FinalPayoutAmount;
            }
            else
            {
                bet.PayoutTiers.Add(NewPayoutTier(requested));
            }
        }

        db.BetPayoutTiers.RemoveRange(existingByCorrectLegs.Values);
    }

    private static BetPayoutTier NewPayoutTier(BetPayoutTierRequest tier) => new()
    {
        RequiredCorrectLegs = tier.RequiredCorrectLegs,
        BasePayoutAmount = tier.BasePayoutAmount ?? tier.FinalPayoutAmount,
        FinalPayoutAmount = tier.FinalPayoutAmount
    };

    private static BetResponse ToResponse(Bet bet)
    {
        var tiers = bet.PayoutTiers.OrderBy(x => x.RequiredCorrectLegs).Select(x => new BetPayoutTierResponse(x.Id, x.RequiredCorrectLegs, x.BasePayoutAmount, x.FinalPayoutAmount)).ToArray();
        var expectedPayout = tiers.FirstOrDefault(x => x.RequiredCorrectLegs == bet.LegCount)?.FinalPayoutAmount;
        return new BetResponse(bet.Id, new PlatformResponse(bet.Platform.Id, bet.Platform.Name, bet.Platform.Type, bet.Platform.IsActive), bet.Source is null ? null : new SourceResponse(bet.Source.Id, bet.Source.Name, bet.Source.Type, bet.Source.IsActive), bet.BankrollAccountId, bet.EntryCost, bet.EntryValue, bet.LegCount, bet.PayoutMode, bet.DecimalOdds, bet.EstimatedProbability, bet.Timing, bet.Status, bet.CorrectLegCount, expectedPayout, bet.ActualPayout, bet.ActualProfitLoss, bet.CurrencyCode, bet.Notes, AsUtc(bet.PlacedAtUtc), AsUtc(bet.SettledAtUtc), bet.IsArchived, AsUtc(bet.ArchivedAtUtc), bet.Bonus is null ? null : new BetBonusResponse(bet.Bonus.Id, bet.Bonus.Type, bet.Bonus.Percentage, bet.Bonus.FixedAmount, bet.Bonus.Description), tiers);
    }

    private static IResult NameValidation(string field, int maximum) => Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = [$"The {field} name is required and cannot exceed {maximum} characters."] });
    private static DateTime AsUtc(DateTime value) => value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    private static DateTime? AsUtc(DateTime? value) => value is null ? null : AsUtc(value.Value);
    private static string UserId(ClaimsPrincipal principal) => principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private sealed record ValidatedBetRequest(Dictionary<string, string[]> Errors, IReadOnlyList<BetPayoutTierRequest> Tiers, decimal? DecimalOdds);
}
