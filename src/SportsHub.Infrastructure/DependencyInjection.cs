using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddSportsHubInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection must be supplied through user-secrets locally or environment variables in production.");
        }

        services.AddDbContext<SportsHubDbContext>(options =>
            options.UseSqlServer(connectionString, sql => sql.MigrationsAssembly(typeof(SportsHubDbContext).Assembly.FullName)));
        return services;
    }
}
