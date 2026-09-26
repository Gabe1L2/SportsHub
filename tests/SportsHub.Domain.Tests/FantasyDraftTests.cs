using SportsHub.Domain.Fantasy;

namespace SportsHub.Domain.Tests;

public sealed class FantasyDraftTests
{
    [Fact]
    public void CompletedDraftCalculatesProfitSeparatelyFromWalletCashFlow()
    {
        var draft = new Draft
        {
            UserId = "user",
            Name = "NBA Best Ball",
            SportName = "Basketball",
            Status = DraftStatus.Completed,
            BuyIn = 25m,
            Winnings = 60m
        };

        Assert.Equal(35m, draft.ProfitLoss);
    }

    [Fact]
    public void OpenDraftHasNoSettledProfit()
    {
        var draft = new Draft
        {
            UserId = "user",
            Name = "NBA Best Ball",
            SportName = "Basketball",
            Status = DraftStatus.InProgress,
            BuyIn = 25m
        };

        Assert.Null(draft.ProfitLoss);
    }
}
