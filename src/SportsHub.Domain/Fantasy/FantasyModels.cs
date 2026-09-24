using SportsHub.Domain.Common;
using SportsHub.Domain.Sports;

namespace SportsHub.Domain.Fantasy;

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
    public DateTime? StartedAtUtc { get; set; }
    public ICollection<DraftPick> Picks { get; set; } = [];
}

public sealed class DraftPick : Entity
{
    public Guid DraftId { get; set; }
    public Draft Draft { get; set; } = null!;
    public Guid PlayerId { get; set; }
    public Player Player { get; set; } = null!;
    public int OverallPick { get; set; }
    public int? Round { get; set; }
    public int? PickInRound { get; set; }
}
