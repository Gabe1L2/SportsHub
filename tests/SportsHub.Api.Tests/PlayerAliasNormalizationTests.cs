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
}
