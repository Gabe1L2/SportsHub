using Microsoft.AspNetCore.Identity;

namespace SportsHub.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser
{
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
