using SportsHub.Domain.Betting;

namespace SportsHub.Domain.Tests;

public sealed class BetTests
{
    [Fact]
    public void Settle_RecordsFinalStatusAndUtcResult()
    {
        var bet = new Bet { UserId = "user-1", EntryCost = 25m, EntryValue = 25m, LegCount = 4, PlacedAtUtc = DateTime.UtcNow };
        var settledAt = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);

        bet.Settle(BetStatus.PartiallyWon, 27.50m, 3, settledAt);

        Assert.Equal(BetStatus.PartiallyWon, bet.Status);
        Assert.Equal(27.50m, bet.ActualPayout);
        Assert.Equal(2.50m, bet.ActualProfitLoss);
        Assert.Equal(3, bet.CorrectLegCount);
        Assert.Equal(settledAt, bet.SettledAtUtc);
    }

    [Fact]
    public void Settle_RejectsPendingStatus()
    {
        var bet = new Bet { UserId = "user-1", EntryCost = 25m, EntryValue = 25m, LegCount = 1, PlacedAtUtc = DateTime.UtcNow };
        Assert.Throws<ArgumentException>(() => bet.Settle(BetStatus.Pending, 0m, 0, DateTime.UtcNow));
    }

    [Theory]
    [InlineData(200, 3.0)]
    [InlineData(-110, 1.909091)]
    public void DecimalOddsFromAmerican_ConvertsBothSigns(int americanOdds, decimal expected)
    {
        Assert.Equal(expected, BetPricing.DecimalOddsFromAmerican(americanOdds), 6);
    }

    [Fact]
    public void DecimalOddsFromPayout_UsesNominalEntryValueForFreeEntry()
    {
        Assert.Equal(2.5m, BetPricing.DecimalOddsFromPayout(entryValue: 20m, totalPayout: 50m));
    }
}
