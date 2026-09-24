using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SportsHub.Infrastructure.Identity;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Infrastructure;

public static class DatabaseStartup
{
    public static async Task InitializeAsync(WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseStartup");

        if (configuration.GetValue<bool>("Database:ApplyMigrationsOnStartup"))
        {
            logger.LogWarning("Applying database migrations because Database:ApplyMigrationsOnStartup is explicitly enabled.");
            await scope.ServiceProvider.GetRequiredService<SportsHubDbContext>().Database.MigrateAsync();
        }

        var email = configuration["BootstrapAdmin:Email"];
        var password = configuration["BootstrapAdmin:Password"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var roleName in new[] { "Admin", "User" })
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                var result = await roleManager.CreateAsync(new IdentityRole(roleName));
                if (!result.Succeeded) throw new InvalidOperationException($"Unable to create Identity role '{roleName}'.");
            }
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = await userManager.FindByEmailAsync(email);
        if (admin is null)
        {
            admin = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true };
            var create = await userManager.CreateAsync(admin, password);
            if (!create.Succeeded)
            {
                var errors = string.Join("; ", create.Errors.Select(x => x.Description));
                throw new InvalidOperationException($"Unable to create bootstrap administrator: {errors}");
            }
        }

        if (!await userManager.IsInRoleAsync(admin, "Admin")) await userManager.AddToRoleAsync(admin, "Admin");
        logger.LogInformation("Bootstrap administrator account is ready for {Email}. Remove BootstrapAdmin:Password from persistent configuration.", email);
    }
}
