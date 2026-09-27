using SportsHub.Api.Features.Fantasy;

namespace SportsHub.Api.Tests;

public sealed class PlayerAliasNormalizationTests
{
    [Theory]
    [InlineData("Nikola Jokić", "nikolajokic")]
    [InlineData("De’Aaron Fox", "deaaronfox")]
    [InlineData("  S.G.A.  ", "sga")]
    public void NormalizationIgnoresAccentsPunctuationAndSpacing(string sourceName, string expected)
    {
        Assert.Equal(expected, FantasyEndpoints.NormalizePlayerName(sourceName));
    }

    [Theory]
    [InlineData("PHO", "PHX")]
    [InlineData("NO", "NOP")]
    [InlineData("N.O.H.", "NOP")]
    [InlineData("BRK", "BKN")]
    [InlineData("GS", "GSW")]
    [InlineData("NY", "NYK")]
    [InlineData("SA", "SAS")]
    [InlineData("UTAH", "UTA")]
    [InlineData("WSH", "WAS")]
    [InlineData("LAL", "LAL")]
    public void TeamAbbreviationVariantsResolveToCanonicalTeam(string sourceTeam, string expected)
    {
        Assert.Equal(expected, FantasyEndpoints.NormalizeTeamAbbreviation(sourceTeam));
    }
}
