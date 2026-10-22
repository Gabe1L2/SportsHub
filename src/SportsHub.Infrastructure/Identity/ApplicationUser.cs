using Microsoft.AspNetCore.Identity;

namespace SportsHub.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser
{
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public decimal KellyMultiplier { get; set; } = 0.25m;
}
