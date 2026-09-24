using System.Text;
using SportsHub.Api.Features.Betting;
using SportsHub.Domain.Betting;

namespace SportsHub.Api.Tests;

public sealed class BetCsvImportParserTests
{
    private const string Header = "Date and Time,Platform,Legs,Flex,Chance to Hit,Stake,Payout,Result,# Correct,PnL,Notes,Source,,Platform,Value";

    [Fact]
    public void ParsesCentralTimeAndIgnoresTrailingSummaryColumns()
    {
        var result = Parse(Header + "\n9/24/2026 9:04:00,DraftKings,3,FALSE,25%,$10.00,$58.00,Win,3,$48.00,Gimme,Me,,DraftKings,$10.00");

        var bet = Assert.Single(result.Records);
        Assert.Equal(new DateTime(2026, 9, 24, 14, 4, 0, DateTimeKind.Utc), bet.PlacedAtUtc);
        Assert.Equal(BetStatus.Won, bet.Status);
        Assert.Equal(58m, bet.ActualPayout);
        Assert.Null(bet.SourceName);
        Assert.Equal(BetBonusType.DiscountPick, bet.Bonus?.Type);
    }

    [Fact]
    public void ConvertsBonusCreditToFreeOneLegEntry()
    {
        var result = Parse(Header + "\n11/20/2025 10:00:00,Dabble,BONUS,FALSE,,,$20.00,Win,,$20.00,,OddsJam");

        var bet = Assert.Single(result.Records);
        Assert.True(bet.IsBonusCredit);
        Assert.Equal(1, bet.LegCount);
        Assert.Equal(0m, bet.EntryCost);
        Assert.Equal(20m, bet.EntryValue);
        Assert.Equal(20m, bet.ActualPayout);
        Assert.Equal(BetBonusType.Other, bet.Bonus?.Type);
        Assert.Contains(result.Issues, x => x.Severity == "Warning");
    }

    [Fact]
    public void LeavesFractionalCorrectLegCountBlankWithWarning()
    {
        var result = Parse(Header + "\n11/1/2025 17:00:00,Dabble,6,TRUE,,$5.00,$2.00,Partial,3.5,-$3.00,,OddsJam");

        var bet = Assert.Single(result.Records);
        Assert.Null(bet.CorrectLegCount);
        Assert.Equal(BetStatus.PartiallyWon, bet.Status);
        Assert.Equal(2m, bet.ActualPayout);
        Assert.Contains(result.Issues, x => x.Message.Contains("whole number", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ParsesExcelAccountingFormatForNegativePnl()
    {
        var result = Parse(Header + "\n9/17/2026 17:05:00,Sleeper,1,FALSE,,$10.00,$31.30,Loss,,($10.00),Gimme pick,Me");

        var bet = Assert.Single(result.Records);
        Assert.Equal(BetStatus.Lost, bet.Status);
        Assert.Equal(0m, bet.ActualPayout);
        Assert.Equal(0, result.ErrorCount);
    }

    [Fact]
    public void RejectsUnexpectedColumnLayout()
    {
        var result = Parse("Platform,Date and Time\nDraftKings,9/24/2026 9:04:00");
        Assert.NotNull(result.FatalError);
    }

    private static BetCsvParseResult Parse(string csv)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        return BetCsvImportParser.Parse(stream);
    }
}
