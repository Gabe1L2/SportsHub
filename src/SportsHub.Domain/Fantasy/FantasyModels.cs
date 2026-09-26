using SportsHub.Domain.Common;
using SportsHub.Domain.Sports;

namespace SportsHub.Domain.Fantasy;

public enum DraftStatus { Scheduled = 0, InProgress = 1, Completed = 2, Cancelled = 3, Active = 4 }

public sealed class ProjectionSource : Entity
{
    public required string Name { get; set; }
    public string? WebsiteUrl { get; set; }
}

public sealed class PlayerProjection : AuditableEntity
{
    public Guid PlayerId { get; set; }
    public Player Player { get; set; } = null!;
    public Guid ProjectionSourceId { get; set; }
    public ProjectionSource ProjectionSource { get; set; } = null!;
    public required string Season { get; set; }
    public decimal? ProjectedFantasyPoints { get; set; }
    public DateTime ImportedAtUtc { get; set; }
    public DateTime? SourceUpdatedAtUtc { get; set; }
}

public sealed class Draft : AuditableEntity
{
    public required string UserId { get; set; }
    public required string Name { get; set; }
    public string? WorkspaceRoomId { get; set; }
    public Guid? LeagueId { get; set; }
    public League? League { get; set; }
    public required string SportName { get; set; }
    public Guid PlatformId { get; set; }
    public SportsHub.Domain.Betting.BettingPlatform Platform { get; set; } = null!;
    public DraftStatus Status { get; set; } = DraftStatus.Scheduled;
    public DateTime? ScheduledAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public int EntrantCount { get; set; }
    public int? DraftSlot { get; set; }
    public int? RoundCount { get; set; }
    public decimal BuyIn { get; set; }
    public int? FinishingPlace { get; set; }
    public decimal? Winnings { get; set; }
    public string CurrencyCode { get; set; } = "USD";
    public string? Notes { get; set; }
    public bool IsArchived { get; set; }
    public ICollection<DraftPick> Picks { get; set; } = [];

    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public decimal? ProfitLoss => Status == DraftStatus.Completed && Winnings is not null ? Winnings.Value - BuyIn : null;
}

public sealed class DraftPick : Entity
{
    public Guid DraftId { get; set; }
    public Draft Draft { get; set; } = null!;
    public Guid? PlayerId { get; set; }
    public Player? Player { get; set; }
    public int OverallPick { get; set; }
    public int? Round { get; set; }
    public int? PickInRound { get; set; }
}

public sealed class FantasyWorkspace : AuditableEntity
{
    public required string UserId { get; set; }
    public required string StateJson { get; set; }
}
