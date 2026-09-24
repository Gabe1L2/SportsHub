using SportsHub.Domain.Betting;

namespace SportsHub.Domain.Tests;

public sealed class BetTests
{
    [Fact]
    public void Settle_RecordsFinalStatusAndUtcResult()
    {
        var bet = new Bet { UserId = "user-1", WagerAmount = 25m, AmericanOdds = 110, PlacedAtUtc = DateTime.UtcNow };
        var settledAt = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);

        bet.Settle(BetStatus.Won, 27.50m, settledAt);

        Assert.Equal(BetStatus.Won, bet.Status);
        Assert.Equal(27.50m, bet.ActualProfitLoss);
        Assert.Equal(settledAt, bet.SettledAtUtc);
    }

    [Fact]
    public void Settle_RejectsPendingStatus()
    {
        var bet = new Bet { UserId = "user-1", WagerAmount = 25m, AmericanOdds = -110, PlacedAtUtc = DateTime.UtcNow };
        Assert.Throws<ArgumentException>(() => bet.Settle(BetStatus.Pending, 0m, DateTime.UtcNow));
    }
}
