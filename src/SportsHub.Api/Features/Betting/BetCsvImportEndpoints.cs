using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualBasic.FileIO;
using SportsHub.Api.Infrastructure;
using SportsHub.Domain.Betting;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Betting;

public sealed record BetCsvImportIssue(int RowNumber, string Severity, string Message);
public sealed record BetCsvImportSample(
    int RowNumber,
    DateTime PlacedAtUtc,
    string Platform,
    int LegCount,
    decimal EntryCost,
    decimal ExpectedPayout,
    BetStatus Status,
    string? Source,
    bool IsDuplicate,
    bool IsBonusCredit);
public sealed record BetCsvImportPreview(
    int TotalRows,
    int ReadyRows,
    int DuplicateRows,
    int RejectedRows,
    int WarningCount,
    int BonusCreditRows,
    IReadOnlyList<string> PlatformsToCreate,
    IReadOnlyList<string> SourcesToCreate,
    IReadOnlyList<BetCsvImportIssue> Issues,
    IReadOnlyList<BetCsvImportSample> Samples);
public sealed record BetCsvImportResult(
    int ImportedRows,
    int DuplicateRows,
    int RejectedRows,
    int PlatformsCreated,
    int SourcesCreated);

public static class BetCsvImportEndpoints
{
    private const long MaximumFileBytes = 10 * 1024 * 1024;

    public static RouteGroupBuilder MapBetCsvImportEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/imports/csv/preview", PreviewAsync)
            .RequireAuthorization("AdminOnly")
            .ValidateAntiforgery();
        group.MapPost("/imports/csv", ImportAsync)
            .RequireAuthorization("AdminOnly")
            .ValidateAntiforgery();
        return group;
    }

    private static async Task<IResult> PreviewAsync(
        IFormFile file,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var invalidFile = ValidateFile(file);
        if (invalidFile is not null) return invalidFile;

        await using var stream = file.OpenReadStream();
        var parsed = BetCsvImportParser.Parse(stream);
        if (parsed.FatalError is not null) return Results.BadRequest(new { title = parsed.FatalError });

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
        var context = await LoadContextAsync(userId, db, cancellationToken);
        var duplicateKeys = new HashSet<BetImportKey>(context.ExistingKeys);
        var duplicates = new HashSet<int>();
        foreach (var record in parsed.Records)
        {
            if (!duplicateKeys.Add(record.Key)) duplicates.Add(record.RowNumber);
        }

        var platformsToCreate = parsed.Records
            .Select(x => x.PlatformName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(x => ResolvePlatform(x, context.Platforms) is null)
            .OrderBy(x => x)
            .ToArray();
        var sourcesToCreate = parsed.Records
            .Select(x => x.SourceName)
            .Where(x => x is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(x => !context.Sources.ContainsKey(x))
            .OrderBy(x => x)
            .ToArray();
        var samples = parsed.Records.Take(10).Select(x => new BetCsvImportSample(
            x.RowNumber, x.PlacedAtUtc, x.PlatformName, x.LegCount, x.EntryCost,
            x.ExpectedPayout, x.Status, x.SourceName, duplicates.Contains(x.RowNumber), x.IsBonusCredit)).ToArray();

        return Results.Ok(new BetCsvImportPreview(
            parsed.TotalRows,
            parsed.Records.Count - duplicates.Count,
            duplicates.Count,
            parsed.ErrorCount,
            parsed.WarningCount,
            parsed.Records.Count(x => x.IsBonusCredit),
            platformsToCreate,
            sourcesToCreate,
            parsed.Issues.Take(100).ToArray(),
            samples));
    }

    private static async Task<IResult> ImportAsync(
        IFormFile file,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var invalidFile = ValidateFile(file);
        if (invalidFile is not null) return invalidFile;

        await using var stream = file.OpenReadStream();
        var parsed = BetCsvImportParser.Parse(stream);
        if (parsed.FatalError is not null) return Results.BadRequest(new { title = parsed.FatalError });
        if (parsed.Records.Count == 0) return Results.BadRequest(new { title = "The CSV does not contain any importable bet rows." });

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var context = await LoadContextAsync(userId, db, cancellationToken);

        var platformCountBefore = context.Platforms.Count;
        foreach (var name in parsed.Records.Select(x => x.PlatformName).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (ResolvePlatform(name, context.Platforms) is not null) continue;
            var platform = new BettingPlatform { Name = name, Type = GuessPlatformType(name), IsActive = true };
            db.BettingPlatforms.Add(platform);
            context.Platforms.Add(platform);
        }

        var sourceCountBefore = context.Sources.Count;
        foreach (var name in parsed.Records.Select(x => x.SourceName).Where(x => x is not null).Cast<string>().Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (context.Sources.ContainsKey(name)) continue;
            var now = DateTime.UtcNow;
            var source = new BetSource
            {
                UserId = userId,
                Name = name,
                Type = GuessSourceType(name),
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            db.BetSources.Add(source);
            context.Sources.Add(name, source);
        }

        var knownKeys = new HashSet<BetImportKey>(context.ExistingKeys);
        var imported = 0;
        var duplicates = 0;
        var importedAt = DateTime.UtcNow;
        foreach (var record in parsed.Records)
        {
            if (!knownKeys.Add(record.Key))
            {
                duplicates++;
                continue;
            }

            var platform = ResolvePlatform(record.PlatformName, context.Platforms)!;
            var source = record.SourceName is null ? null : context.Sources[record.SourceName];
            var bet = new Bet
            {
                UserId = userId,
                Platform = platform,
                Source = source,
                EntryCost = record.EntryCost,
                EntryValue = record.EntryValue,
                LegCount = record.LegCount,
                PayoutMode = record.PayoutMode,
                DecimalOdds = record.DecimalOdds,
                EstimatedProbability = record.EstimatedProbability,
                Timing = BetTiming.Pregame,
                Status = record.Status,
                CorrectLegCount = record.CorrectLegCount,
                ActualPayout = record.ActualPayout,
                CurrencyCode = "USD",
                Notes = record.Notes,
                PlacedAtUtc = record.PlacedAtUtc,
                SettledAtUtc = null,
                CreatedAtUtc = importedAt,
                UpdatedAtUtc = importedAt
            };
            bet.PayoutTiers.Add(new BetPayoutTier
            {
                RequiredCorrectLegs = record.LegCount,
                BasePayoutAmount = record.ExpectedPayout,
                FinalPayoutAmount = record.ExpectedPayout
            });
            if (record.Bonus is not null)
            {
                bet.Bonus = new BetBonus
                {
                    Type = record.Bonus.Type,
                    Percentage = record.Bonus.Percentage,
                    Description = record.Bonus.Description
                };
            }
            db.Bets.Add(bet);
            imported++;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(new BetCsvImportResult(
            imported,
            duplicates,
            parsed.ErrorCount,
            context.Platforms.Count - platformCountBefore,
            context.Sources.Count - sourceCountBefore));
    }

    private static IResult? ValidateFile(IFormFile file)
    {
        if (file.Length == 0) return Results.BadRequest(new { title = "Choose a non-empty CSV file." });
        if (file.Length > MaximumFileBytes) return Results.BadRequest(new { title = "The CSV file cannot be larger than 10 MB." });
        if (!string.Equals(Path.GetExtension(file.FileName), ".csv", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest(new { title = "Choose a .csv file exported from the bet tracker sheet." });
        return null;
    }

    private static async Task<BetImportContext> LoadContextAsync(string userId, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var platforms = await db.BettingPlatforms.ToListAsync(cancellationToken);
        var sources = await db.BetSources.Where(x => x.UserId == userId).ToDictionaryAsync(x => x.Name, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var existing = await db.Bets.AsNoTracking().Include(x => x.PayoutTiers).Where(x => x.UserId == userId).ToListAsync(cancellationToken);
        var keys = existing.Select(x => new BetImportKey(
            DateTime.SpecifyKind(x.PlacedAtUtc, DateTimeKind.Utc).Ticks,
            x.EntryCost,
            x.LegCount,
            x.PayoutTiers.FirstOrDefault(t => t.RequiredCorrectLegs == x.LegCount)?.FinalPayoutAmount ?? 0m)).ToHashSet();
        return new BetImportContext(platforms, sources, keys);
    }

    private static BettingPlatform? ResolvePlatform(string csvName, IReadOnlyCollection<BettingPlatform> platforms)
    {
        var exact = platforms.FirstOrDefault(x => string.Equals(x.Name, csvName, StringComparison.OrdinalIgnoreCase));
        if (exact is not null) return exact;
        var aliases = platforms.Where(x =>
            x.Name.StartsWith(csvName + " ", StringComparison.OrdinalIgnoreCase) ||
            csvName.StartsWith(x.Name + " ", StringComparison.OrdinalIgnoreCase)).ToArray();
        return aliases.Length == 1 ? aliases[0] : null;
    }

    private static BettingPlatformType GuessPlatformType(string name) =>
        name.Contains("Polymarket", StringComparison.OrdinalIgnoreCase) ? BettingPlatformType.Exchange :
        name.Contains("Fliff", StringComparison.OrdinalIgnoreCase) ? BettingPlatformType.Sportsbook :
        BettingPlatformType.PickEm;

    private static BetSourceType GuessSourceType(string name) =>
        name.Contains("OddsJam", StringComparison.OrdinalIgnoreCase) || name.Contains("DailyGrind", StringComparison.OrdinalIgnoreCase)
            ? BetSourceType.Tool
            : BetSourceType.Capper;

    private sealed record BetImportContext(
        List<BettingPlatform> Platforms,
        Dictionary<string, BetSource> Sources,
        HashSet<BetImportKey> ExistingKeys);
}

public sealed record ParsedBetBonus(BetBonusType Type, decimal? Percentage, string Description);
public sealed record ParsedBetCsvRecord(
    int RowNumber,
    DateTime PlacedAtUtc,
    string PlatformName,
    int LegCount,
    BetPayoutMode PayoutMode,
    decimal EntryCost,
    decimal EntryValue,
    decimal ExpectedPayout,
    decimal? DecimalOdds,
    decimal? EstimatedProbability,
    BetStatus Status,
    int? CorrectLegCount,
    decimal? ActualPayout,
    string? Notes,
    string? SourceName,
    ParsedBetBonus? Bonus,
    bool IsBonusCredit)
{
    public BetImportKey Key => new(PlacedAtUtc.Ticks, EntryCost, LegCount, ExpectedPayout);
}

public readonly record struct BetImportKey(long PlacedAtUtcTicks, decimal EntryCost, int LegCount, decimal ExpectedPayout);
public sealed record BetCsvParseResult(
    int TotalRows,
    IReadOnlyList<ParsedBetCsvRecord> Records,
    IReadOnlyList<BetCsvImportIssue> Issues,
    string? FatalError)
{
    public int ErrorCount => Issues.Count(x => x.Severity == "Error");
    public int WarningCount => Issues.Count(x => x.Severity == "Warning");
}

public static partial class BetCsvImportParser
{
    private static readonly string[] ExpectedHeaders =
    [
        "Date and Time", "Platform", "Legs", "Flex", "Chance to Hit", "Stake",
        "Payout", "Result", "# Correct", "PnL", "Notes", "Source"
    ];

    public static BetCsvParseResult Parse(Stream stream)
    {
        var records = new List<ParsedBetCsvRecord>();
        var issues = new List<BetCsvImportIssue>();
        var totalRows = 0;
        using var parser = new TextFieldParser(stream, Encoding.UTF8, detectEncoding: true, leaveOpen: true)
        {
            TextFieldType = FieldType.Delimited,
            HasFieldsEnclosedInQuotes = true,
            TrimWhiteSpace = false
        };
        parser.SetDelimiters(",");

        string[]? header;
        try { header = parser.ReadFields(); }
        catch (MalformedLineException) { return new BetCsvParseResult(0, records, issues, "The CSV header is malformed."); }
        if (header is null || header.Length < ExpectedHeaders.Length)
            return new BetCsvParseResult(0, records, issues, "The CSV is missing one or more expected bet columns.");
        for (var index = 0; index < ExpectedHeaders.Length; index++)
        {
            if (!string.Equals(header[index].Trim(), ExpectedHeaders[index], StringComparison.OrdinalIgnoreCase))
                return new BetCsvParseResult(0, records, issues, $"Column {index + 1} must be '{ExpectedHeaders[index]}'. The selected file has '{header[index]}'.");
        }

        var centralTime = FindCentralTimeZone();
        var rowNumber = 1;
        while (!parser.EndOfData)
        {
            rowNumber++;
            string[]? fields;
            try { fields = parser.ReadFields(); }
            catch (MalformedLineException exception)
            {
                totalRows++;
                issues.Add(new BetCsvImportIssue(rowNumber, "Error", $"Malformed CSV row: {exception.Message}"));
                continue;
            }
            if (fields is null) continue;
            Array.Resize(ref fields, Math.Max(fields.Length, ExpectedHeaders.Length));
            // Google Sheets table exports can include a blank filter/summary row with FALSE and $0.00 defaults.
            if (string.IsNullOrWhiteSpace(fields[0]) && string.IsNullOrWhiteSpace(fields[1])) continue;
            totalRows++;

            var rowIssues = new List<BetCsvImportIssue>();
            ParsedBetCsvRecord? record = ParseRow(fields, rowNumber, centralTime, rowIssues);
            issues.AddRange(rowIssues);
            if (record is not null) records.Add(record);
        }
        return new BetCsvParseResult(totalRows, records, issues, null);
    }

    private static ParsedBetCsvRecord? ParseRow(string[] fields, int rowNumber, TimeZoneInfo centralTime, List<BetCsvImportIssue> issues)
    {
        var dateText = fields[0].Trim();
        var platform = fields[1].Trim();
        if (!DateTime.TryParse(dateText, CultureInfo.GetCultureInfo("en-US"), DateTimeStyles.AllowWhiteSpaces, out var localTime))
            Error("Date and Time is not a recognized US date/time.");
        if (string.IsNullOrWhiteSpace(platform)) Error("Platform is required.");

        var payout = ParseMoney(fields[6], out var payoutValid);
        if (!payoutValid)
        {
            payout = 0m;
            Warn("Payout was blank, so the expected payout was imported as $0.00.");
        }
        var entryCost = ParseMoney(fields[5], out var entryValid);
        var isBonusCredit = string.Equals(fields[2].Trim(), "BONUS", StringComparison.OrdinalIgnoreCase) ||
                            (string.IsNullOrWhiteSpace(fields[2]) && (!entryValid || entryCost == 0m) && payout > 0m);
        if (!entryValid)
        {
            if (isBonusCredit) entryCost = 0m;
            else Error("Stake is required and must be a valid dollar amount.");
        }
        if (entryCost < 0m) Error("Stake cannot be negative.");
        if (payout < 0m) Error("Payout cannot be negative.");

        int legCount;
        if (isBonusCredit)
        {
            legCount = 1;
            Warn("Bonus/free-credit row was imported as a one-leg $0 cost entry so its P&L is preserved.");
        }
        else if (string.IsNullOrWhiteSpace(fields[2]))
        {
            legCount = 1;
            Warn("Legs was blank, so the row was imported as a one-leg entry.");
        }
        else if (!int.TryParse(fields[2].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out legCount) || legCount is < 1 or > 100)
        {
            legCount = 0;
            Error("Legs must be a whole number from 1 to 100.");
        }

        var flexText = fields[3].Trim();
        if (!bool.TryParse(flexText, out var flex))
        {
            flex = false;
            Error("Flex must be TRUE or FALSE.");
        }

        decimal? probability = null;
        if (!string.IsNullOrWhiteSpace(fields[4]))
        {
            var percentText = fields[4].Trim().TrimEnd('%');
            if (decimal.TryParse(percentText, NumberStyles.Number, CultureInfo.InvariantCulture, out var percent) && percent is >= 0m and <= 100m)
                probability = percent / 100m;
            else if (percent is > 100m and <= 10_000m)
            {
                probability = percent / 10_000m;
                Warn($"Chance to Hit was {percent}%; it was interpreted as {percent / 100m}%.");
            }
            else Error("Chance to Hit must be a percentage from 0% to 100%.");
        }

        var resultText = fields[7].Trim();
        var pnl = ParseMoney(fields[9], out var pnlValid);
        if (!TryParseStatus(resultText, pnl, pnlValid, isBonusCredit, out var status))
            Error($"Result '{resultText}' is not supported.");
        if (!pnlValid && status != BetStatus.Pending) Error("PnL is required for a settled row.");

        int? correctLegCount = null;
        if (!string.IsNullOrWhiteSpace(fields[8]))
        {
            if (int.TryParse(fields[8].Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var correct) && correct >= 0 && correct <= legCount)
                correctLegCount = correct;
            else Warn("# Correct was not a whole number within the leg count, so it was left blank.");
        }

        if (issues.Any(x => x.Severity == "Error")) return null;

        localTime = DateTime.SpecifyKind(localTime, DateTimeKind.Unspecified);
        if (centralTime.IsInvalidTime(localTime))
        {
            Error("Date and Time falls in the skipped daylight-saving hour.");
            return null;
        }
        if (centralTime.IsAmbiguousTime(localTime)) Warn("Date and Time is in the repeated daylight-saving hour; standard time was used.");
        var placedAtUtc = TimeZoneInfo.ConvertTimeToUtc(localTime, centralTime);

        var notes = NullIfWhiteSpace(fields[10]);
        var source = NullIfWhiteSpace(fields[11]);
        if (string.Equals(source, "Me", StringComparison.OrdinalIgnoreCase)) source = null;
        var entryValue = entryCost > 0m ? entryCost : InferFreeEntryValue(notes, payout);
        decimal? decimalOdds = payout > 0m ? decimal.Round(payout / entryValue, 6, MidpointRounding.AwayFromZero) : null;
        decimal? actualPayout = status == BetStatus.Pending ? null : decimal.Max(0m, entryCost + (pnlValid ? pnl : 0m));
        var bonus = ParseBonus(notes, isBonusCredit);

        return new ParsedBetCsvRecord(
            rowNumber,
            placedAtUtc,
            platform,
            legCount,
            flex ? BetPayoutMode.Flex : BetPayoutMode.AllOrNothing,
            entryCost,
            entryValue,
            payout,
            decimalOdds,
            probability,
            status,
            correctLegCount,
            actualPayout,
            notes,
            source,
            bonus,
            isBonusCredit);

        void Error(string message) => issues.Add(new BetCsvImportIssue(rowNumber, "Error", message));
        void Warn(string message) => issues.Add(new BetCsvImportIssue(rowNumber, "Warning", message));
    }

    private static bool TryParseStatus(string value, decimal pnl, bool pnlValid, bool isBonusCredit, out BetStatus status)
    {
        status = value.ToUpperInvariant() switch
        {
            "PENDING" => BetStatus.Pending,
            "WIN" => BetStatus.Won,
            "LOSS" => BetStatus.Lost,
            "PARTIAL" => BetStatus.PartiallyWon,
            "PUSH" => BetStatus.Push,
            "VOID" or "VOIDED" => BetStatus.Voided,
            _ => BetStatus.Pending
        };
        if (!string.IsNullOrWhiteSpace(value)) return value.ToUpperInvariant() is "PENDING" or "WIN" or "LOSS" or "PARTIAL" or "PUSH" or "VOID" or "VOIDED";
        if (!isBonusCredit || !pnlValid) return false;
        status = pnl > 0m ? BetStatus.Won : pnl < 0m ? BetStatus.Lost : BetStatus.Push;
        return true;
    }

    private static ParsedBetBonus? ParseBonus(string? notes, bool isBonusCredit)
    {
        if (isBonusCredit) return new ParsedBetBonus(BetBonusType.Other, null, notes ?? "Imported bonus credit");
        if (notes is null) return null;
        var match = PercentageRegex().Match(notes);
        if (notes.Contains("boost", StringComparison.OrdinalIgnoreCase))
            return new ParsedBetBonus(BetBonusType.PayoutBoost, match.Success ? decimal.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) / 100m : null, notes);
        if (notes.Contains("discount", StringComparison.OrdinalIgnoreCase) ||
            notes.Contains("gimme", StringComparison.OrdinalIgnoreCase) ||
            notes.Contains("taco", StringComparison.OrdinalIgnoreCase) ||
            notes.Contains("rescued", StringComparison.OrdinalIgnoreCase))
            return new ParsedBetBonus(BetBonusType.DiscountPick, match.Success ? decimal.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) / 100m : null, notes);
        if (notes.Contains("free", StringComparison.OrdinalIgnoreCase))
            return new ParsedBetBonus(BetBonusType.FreeEntry, null, notes);
        if (notes.Contains("protect", StringComparison.OrdinalIgnoreCase) || notes.Contains("insured", StringComparison.OrdinalIgnoreCase))
            return new ParsedBetBonus(BetBonusType.ProtectedEntry, null, notes);
        return null;
    }

    private static decimal InferFreeEntryValue(string? notes, decimal payout)
    {
        if (notes is not null)
        {
            var match = DollarAmountRegex().Match(notes);
            if (match.Success && decimal.TryParse(match.Groups[1].Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) && amount > 0m)
                return amount;
        }
        return payout > 0m ? payout : 0.01m;
    }

    private static decimal ParseMoney(string value, out bool valid)
    {
        var trimmed = value.Trim();
        var accountingNegative = trimmed.Length >= 2 && trimmed[0] == '(' && trimmed[^1] == ')';
        var normalized = (accountingNegative ? trimmed[1..^1] : trimmed)
            .Replace("$", "", StringComparison.Ordinal)
            .Replace(",", "", StringComparison.Ordinal)
            .Trim();
        var result = 0m;
        valid = normalized.Length > 0 && decimal.TryParse(normalized, NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out result);
        if (!valid) return 0m;
        return accountingNegative ? -decimal.Abs(result) : result;
    }

    private static string? NullIfWhiteSpace(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static TimeZoneInfo FindCentralTimeZone()
    {
        foreach (var id in new[] { "Central Standard Time", "America/Chicago" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
        }
        throw new InvalidOperationException("The server does not provide an America/Chicago time zone.");
    }

    [GeneratedRegex(@"(\d+(?:\.\d+)?)\s*%", RegexOptions.IgnoreCase)]
    private static partial Regex PercentageRegex();

    [GeneratedRegex(@"\$\s*(\d+(?:\.\d+)?)", RegexOptions.IgnoreCase)]
    private static partial Regex DollarAmountRegex();
}
