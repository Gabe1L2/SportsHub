using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SportsHub.Infrastructure.Persistence;

public sealed class SportsHubDbContextFactory : IDesignTimeDbContextFactory<SportsHubDbContext>
{
    public SportsHubDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection before running EF Core design-time commands.");

        var options = new DbContextOptionsBuilder<SportsHubDbContext>()
            .UseSqlServer(connectionString)
            .Options;
        return new SportsHubDbContext(options);
    }
}
