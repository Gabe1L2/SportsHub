using SportsHub.Domain.Betting;

namespace SportsHub.Domain.Tests;

public sealed class BettingFinanceTests
{
    [Theory]
    [InlineData(BankrollTransactionType.Deposit, 100, 100)]
    [InlineData(BankrollTransactionType.Deposit, -100, 100)]
    [InlineData(BankrollTransactionType.Withdrawal, 100, -100)]
    [InlineData(BankrollTransactionType.Withdrawal, -100, -100)]
    [InlineData(BankrollTransactionType.Adjustment, -5, -5)]
    public void LedgerAmountUsesTransactionTypeForCashFlowDirection(
        BankrollTransactionType type,
        decimal storedAmount,
        decimal expectedAmount)
    {
        Assert.Equal(expectedAmount, BettingFinanceMath.LedgerAmount(type, storedAmount));
    }

    [Fact]
    public void CurrentBankrollCombinesBetProfitCashFlowAndAdjustments()
    {
        var balance = BettingFinanceMath.CurrentBankroll(
            betProfit: 4_000m,
            deposits: 1_000m,
            withdrawals: 4_500m,
            adjustments: 5m);

        Assert.Equal(505m, balance);
    }

    [Fact]
    public void ToolCostsReduceOverallProfitWithoutChangingBankroll()
    {
        Assert.Equal(3_700m, BettingFinanceMath.OverallProfitAfterTools(4_000m, 300m));
        Assert.Equal(500m, BettingFinanceMath.CurrentBankroll(4_000m, 1_000m, 4_500m, 0m));
    }
}
