using SportsHub.Domain.Common;

namespace SportsHub.Domain.Sports;

public sealed class Sport : Entity
{
    public required string Name { get; set; }
    public required string Slug { get; set; }
}

public sealed class League : Entity
{
    public required string Name { get; set; }
    public required string Abbreviation { get; set; }
    public Guid SportId { get; set; }
    public Sport Sport { get; set; } = null!;
}

public sealed class Team : Entity
{
    public required string Name { get; set; }
    public required string Abbreviation { get; set; }
    public Guid LeagueId { get; set; }
    public League League { get; set; } = null!;
}

public sealed class Player : AuditableEntity
{
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public string? DisplayName { get; set; }
    public Guid LeagueId { get; set; }
    public League League { get; set; } = null!;
    public Guid? TeamId { get; set; }
    public Team? Team { get; set; }
    public string? Position { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<PlayerExternalId> ExternalIds { get; set; } = [];
}

public sealed class Provider : Entity
{
    public required string Name { get; set; }
    public required string Key { get; set; }
}

public sealed class PlayerExternalId : Entity
{
    public Guid PlayerId { get; set; }
    public Player Player { get; set; } = null!;
    public Guid ProviderId { get; set; }
    public Provider Provider { get; set; } = null!;
    public required string ExternalId { get; set; }
    public string? SourceName { get; set; }
}
