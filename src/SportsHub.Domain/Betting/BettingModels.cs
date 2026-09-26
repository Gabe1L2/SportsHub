using System.ComponentModel.DataAnnotations.Schema;
using SportsHub.Domain.Common;

namespace SportsHub.Domain.Betting;

public enum BetStatus
{
    Pending = 0,
    Won = 1,
    Lost = 2,
    Push = 3,
    Voided = 4,
    PartiallyWon = 5
}

public enum BetPayoutMode { AllOrNothing, Flex }
public enum BetTiming { Pregame, Live }
public enum BettingPlatformType { PickEm, Sportsbook, Exchange, Other }
public enum BetSourceType { Self, Tool, Capper, Friend, Other }
public enum BetBonusType { PayoutBoost, DiscountPick, FreeEntry, ProtectedEntry, Other }
public enum BankrollTransactionType { Deposit, Withdrawal, Adjustment }

public sealed class BettingPlatform : Entity
{
    public required string Name { get; set; }
    public BettingPlatformType Type { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class BetSource : AuditableEntity
{
    public required string UserId { get; set; }
    public required string Name { get; set; }
    public BetSourceType Type { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class Bet : AuditableEntity
{
    public required string UserId { get; set; }
    public Guid PlatformId { get; set; }
    public BettingPlatform Platform { get; set; } = null!;
    public Guid? SourceId { get; set; }
    public BetSource? Source { get; set; }
    public decimal EntryCost { get; set; }
    public decimal EntryValue { get; set; }
    public int LegCount { get; set; } = 1;
    public BetPayoutMode PayoutMode { get; set; }
    public decimal? DecimalOdds { get; set; }
    public decimal? EstimatedProbability { get; set; }
    public BetTiming Timing { get; set; }
    public BetStatus Status { get; set; } = BetStatus.Pending;
    public int? CorrectLegCount { get; set; }
    public decimal? ActualPayout { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public string? Notes { get; set; }
    public DateTime PlacedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SettledAtUtc { get; set; }
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAtUtc { get; set; }
    public BetBonus? Bonus { get; set; }
    public ICollection<BetPayoutTier> PayoutTiers { get; set; } = [];

    [NotMapped]
    public decimal? ActualProfitLoss => ActualPayout is null ? null : ActualPayout.Value - EntryCost;

    public void Settle(BetStatus status, decimal actualPayout, int? correctLegCount, DateTime settledAtUtc)
    {
        if (status is BetStatus.Pending) throw new ArgumentException("A settled bet cannot remain pending.", nameof(status));
        if (actualPayout < 0) throw new ArgumentOutOfRangeException(nameof(actualPayout), "Actual payout cannot be negative.");
        if (correctLegCount is < 0 || correctLegCount > LegCount)
            throw new ArgumentOutOfRangeException(nameof(correctLegCount), "Correct legs must be between zero and the bet's leg count.");
        if (settledAtUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("Settlement time must be UTC.", nameof(settledAtUtc));

        Status = status;
        ActualPayout = actualPayout;
        CorrectLegCount = correctLegCount;
        SettledAtUtc = settledAtUtc;
        UpdatedAtUtc = settledAtUtc;
    }

    public void SetArchived(bool archived, DateTime changedAtUtc)
    {
        if (changedAtUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("Archive time must be UTC.", nameof(changedAtUtc));
        IsArchived = archived;
        ArchivedAtUtc = archived ? changedAtUtc : null;
        UpdatedAtUtc = changedAtUtc;
    }
}

public sealed class BetPayoutTier : Entity
{
    public Guid BetId { get; set; }
    public Bet Bet { get; set; } = null!;
    public int RequiredCorrectLegs { get; set; }
    public decimal BasePayoutAmount { get; set; }
    public decimal FinalPayoutAmount { get; set; }
}

public sealed class BetBonus : Entity
{
    public Guid BetId { get; set; }
    public Bet Bet { get; set; } = null!;
    public BetBonusType Type { get; set; }
    public decimal? Percentage { get; set; }
    public decimal? FixedAmount { get; set; }
    public string? Description { get; set; }
}

public static class BetPricing
{
    public static decimal DecimalOddsFromAmerican(int americanOdds)
    {
        if (americanOdds == 0) throw new ArgumentOutOfRangeException(nameof(americanOdds), "American odds cannot be zero.");
        return americanOdds > 0
            ? 1m + americanOdds / 100m
            : 1m + 100m / Math.Abs((decimal)americanOdds);
    }

    public static decimal DecimalOddsFromPayout(decimal entryValue, decimal totalPayout)
    {
        if (entryValue <= 0) throw new ArgumentOutOfRangeException(nameof(entryValue), "Entry value must be greater than zero.");
        if (totalPayout < 0) throw new ArgumentOutOfRangeException(nameof(totalPayout), "Payout cannot be negative.");
        return totalPayout / entryValue;
    }
}

public sealed class BankrollTransaction : AuditableEntity
{
    public required string UserId { get; set; }
    public Guid? PlatformId { get; set; }
    public BettingPlatform? Platform { get; set; }
    public BankrollTransactionType Type { get; set; }
    // Signed ledger value: deposits are positive, withdrawals negative, and adjustments may be either.
    public decimal Amount { get; set; }
    public decimal? TargetBalance { get; set; }
    public DateTime OccurredAtUtc { get; set; }
    public string? Note { get; set; }
}

public sealed class BettingToolExpense : AuditableEntity
{
    public required string UserId { get; set; }
    public required string ToolName { get; set; }
    public decimal Amount { get; set; }
    public DateTime IncurredAtUtc { get; set; }
    public string? Note { get; set; }
}

public static class BettingFinanceMath
{
    public static decimal LedgerAmount(BankrollTransactionType type, decimal amount) => type switch
    {
        BankrollTransactionType.Deposit => decimal.Abs(amount),
        BankrollTransactionType.Withdrawal => -decimal.Abs(amount),
        _ => amount
    };

    public static decimal CurrentBankroll(decimal betProfit, decimal deposits, decimal withdrawals, decimal adjustments) =>
        betProfit + deposits - withdrawals + adjustments;

    public static decimal CurrentSportsBankroll(decimal betProfit, decimal fantasyProfit, decimal deposits, decimal withdrawals, decimal adjustments) =>
        betProfit + fantasyProfit + deposits - withdrawals + adjustments;

    public static decimal OverallProfitAfterTools(decimal betProfit, decimal toolCosts) => betProfit - toolCosts;
}
