using SportsHub.Domain.Common;
using SportsHub.Domain.Sports;

namespace SportsHub.Domain.Betting;

public enum BetStatus { Pending, Won, Lost, Push, Voided }
public enum BetType { Spread, Moneyline, Total, PlayerProp, Other }
public enum BankrollTransactionType { Deposit, Withdrawal, Bonus, BetSettlement, Adjustment }

public sealed class Sportsbook : Entity
{
    public required string Name { get; set; }
}

public sealed class Bet : AuditableEntity
{
    public required string UserId { get; set; }
    public Guid SportsbookId { get; set; }
    public Sportsbook Sportsbook { get; set; } = null!;
    public decimal WagerAmount { get; set; }
    public decimal? PotentialPayout { get; set; }
    public decimal? ActualProfitLoss { get; set; }
    public int AmericanOdds { get; set; }
    public BetStatus Status { get; set; } = BetStatus.Pending;
    public DateTime PlacedAtUtc { get; set; }
    public DateTime? SettledAtUtc { get; set; }
    public ICollection<BetLeg> Legs { get; set; } = [];

    public void Settle(BetStatus status, decimal actualProfitLoss, DateTime settledAtUtc)
    {
        if (status is BetStatus.Pending) throw new ArgumentException("A settled bet cannot remain pending.", nameof(status));
        if (settledAtUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("Settlement time must be UTC.", nameof(settledAtUtc));
        Status = status;
        ActualProfitLoss = actualProfitLoss;
        SettledAtUtc = settledAtUtc;
        UpdatedAtUtc = settledAtUtc;
    }
}

public sealed class BetLeg : Entity
{
    public Guid BetId { get; set; }
    public Bet Bet { get; set; } = null!;
    public BetType Type { get; set; }
    public Guid? PlayerId { get; set; }
    public Player? Player { get; set; }
    public required string Description { get; set; }
    public decimal? Line { get; set; }
    public int? AmericanOdds { get; set; }
}

public sealed class BankrollAccount : AuditableEntity
{
    public required string UserId { get; set; }
    public required string Name { get; set; }
    public decimal CurrentBalance { get; set; }
    public ICollection<BankrollTransaction> Transactions { get; set; } = [];
}

public sealed class BankrollTransaction : Entity
{
    public Guid BankrollAccountId { get; set; }
    public BankrollAccount BankrollAccount { get; set; } = null!;
    public BankrollTransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public DateTime OccurredAtUtc { get; set; }
    public string? Note { get; set; }
}
