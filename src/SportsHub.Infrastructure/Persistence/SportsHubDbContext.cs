using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SportsHub.Domain.Betting;
using SportsHub.Domain.Fantasy;
using SportsHub.Domain.Sports;
using SportsHub.Infrastructure.Identity;

namespace SportsHub.Infrastructure.Persistence;

public sealed class SportsHubDbContext(DbContextOptions<SportsHubDbContext> options)
    : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Sport> Sports => Set<Sport>();
    public DbSet<League> Leagues => Set<League>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Provider> Providers => Set<Provider>();
    public DbSet<PlayerExternalId> PlayerExternalIds => Set<PlayerExternalId>();
    public DbSet<ProjectionSource> ProjectionSources => Set<ProjectionSource>();
    public DbSet<PlayerProjection> PlayerProjections => Set<PlayerProjection>();
    public DbSet<Draft> Drafts => Set<Draft>();
    public DbSet<DraftPick> DraftPicks => Set<DraftPick>();
    public DbSet<BettingPlatform> BettingPlatforms => Set<BettingPlatform>();
    public DbSet<BetSource> BetSources => Set<BetSource>();
    public DbSet<Bet> Bets => Set<Bet>();
    public DbSet<BetPayoutTier> BetPayoutTiers => Set<BetPayoutTier>();
    public DbSet<BetBonus> BetBonuses => Set<BetBonus>();
    public DbSet<BankrollTransaction> BankrollTransactions => Set<BankrollTransaction>();
    public DbSet<BettingToolExpense> BettingToolExpenses => Set<BettingToolExpense>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        ConfigureSports(builder);
        ConfigureFantasy(builder);
        ConfigureBetting(builder);
    }

    private static void ConfigureSports(ModelBuilder builder)
    {
        builder.Entity<Sport>(e => { e.ToTable("Sports", "sports"); e.HasIndex(x => x.Slug).IsUnique(); e.Property(x => x.Name).HasMaxLength(80); e.Property(x => x.Slug).HasMaxLength(80); });
        builder.Entity<League>(e => { e.ToTable("Leagues", "sports"); e.HasIndex(x => x.Abbreviation); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.Abbreviation).HasMaxLength(20); e.HasOne(x => x.Sport).WithMany().HasForeignKey(x => x.SportId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<Team>(e => { e.ToTable("Teams", "sports"); e.HasIndex(x => new { x.LeagueId, x.Abbreviation }).IsUnique(); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.Abbreviation).HasMaxLength(20); e.HasOne(x => x.League).WithMany().HasForeignKey(x => x.LeagueId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<Player>(e => { e.ToTable("Players", "sports"); e.HasIndex(x => new { x.LeagueId, x.LastName, x.FirstName }); e.Property(x => x.FirstName).HasMaxLength(100); e.Property(x => x.LastName).HasMaxLength(100); e.Property(x => x.DisplayName).HasMaxLength(220); e.Property(x => x.Position).HasMaxLength(30); e.HasOne(x => x.League).WithMany().HasForeignKey(x => x.LeagueId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Team).WithMany().HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.SetNull); });
        builder.Entity<Provider>(e => { e.ToTable("Providers", "sports"); e.HasIndex(x => x.Key).IsUnique(); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.Key).HasMaxLength(80); });
        builder.Entity<PlayerExternalId>(e => { e.ToTable("PlayerExternalIds", "sports"); e.HasIndex(x => new { x.ProviderId, x.ExternalId }).IsUnique(); e.Property(x => x.ExternalId).HasMaxLength(200); e.Property(x => x.SourceName).HasMaxLength(220); e.HasOne(x => x.Player).WithMany(x => x.ExternalIds).HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Provider).WithMany().HasForeignKey(x => x.ProviderId).OnDelete(DeleteBehavior.Restrict); });
    }

    private static void ConfigureFantasy(ModelBuilder builder)
    {
        builder.Entity<ProjectionSource>(e => { e.ToTable("ProjectionSources", "fantasy"); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.WebsiteUrl).HasMaxLength(500); });
        builder.Entity<PlayerProjection>(e => { e.ToTable("PlayerProjections", "fantasy"); e.HasIndex(x => new { x.PlayerId, x.ProjectionSourceId, x.Season }); e.Property(x => x.Season).HasMaxLength(30); e.Property(x => x.ProjectedFantasyPoints).HasPrecision(12, 3); e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.ProjectionSource).WithMany().HasForeignKey(x => x.ProjectionSourceId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<Draft>(e => { e.ToTable("Drafts", "fantasy"); e.HasIndex(x => new { x.UserId, x.CreatedAtUtc }); e.Property(x => x.UserId).HasMaxLength(450); e.Property(x => x.Name).HasMaxLength(160); e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<DraftPick>(e => { e.ToTable("DraftPicks", "fantasy"); e.HasIndex(x => new { x.DraftId, x.OverallPick }).IsUnique(); e.HasOne(x => x.Draft).WithMany(x => x.Picks).HasForeignKey(x => x.DraftId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict); });
    }

    private static void ConfigureBetting(ModelBuilder builder)
    {
        builder.Entity<BettingPlatform>(e =>
        {
            e.ToTable("Platforms", "betting");
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).HasMaxLength(120);
            e.Property(x => x.IsActive).HasDefaultValue(true);
        });
        builder.Entity<BetSource>(e =>
        {
            e.ToTable("BetSources", "betting");
            e.HasIndex(x => new { x.UserId, x.Name }).IsUnique();
            e.Property(x => x.UserId).HasMaxLength(450);
            e.Property(x => x.Name).HasMaxLength(160);
            e.Property(x => x.IsActive).HasDefaultValue(true);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<Bet>(e =>
        {
            e.ToTable("Bets", "betting");
            e.HasIndex(x => new { x.UserId, x.PlacedAtUtc });
            e.HasIndex(x => new { x.UserId, x.Status });
            e.HasIndex(x => new { x.UserId, x.IsArchived, x.PlacedAtUtc });
            e.Property(x => x.UserId).HasMaxLength(450);
            e.Property(x => x.EntryCost).HasPrecision(18, 2);
            e.Property(x => x.EntryValue).HasPrecision(18, 2);
            e.Property(x => x.LegCount).HasDefaultValue(1);
            e.Property(x => x.IsArchived).HasDefaultValue(false);
            e.Property(x => x.DecimalOdds).HasPrecision(18, 6);
            e.Property(x => x.EstimatedProbability).HasPrecision(7, 6);
            e.Property(x => x.ActualPayout).HasPrecision(18, 2);
            e.Property(x => x.CurrencyCode).HasMaxLength(3).IsUnicode(false).HasDefaultValue("USD");
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Platform).WithMany().HasForeignKey(x => x.PlatformId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Source).WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<BetPayoutTier>(e =>
        {
            e.ToTable("BetPayoutTiers", "betting");
            e.HasIndex(x => new { x.BetId, x.RequiredCorrectLegs }).IsUnique();
            e.Property(x => x.BasePayoutAmount).HasPrecision(18, 2);
            e.Property(x => x.FinalPayoutAmount).HasPrecision(18, 2);
            e.HasOne(x => x.Bet).WithMany(x => x.PayoutTiers).HasForeignKey(x => x.BetId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<BetBonus>(e =>
        {
            e.ToTable("BetBonuses", "betting");
            e.HasIndex(x => x.BetId).IsUnique();
            e.Property(x => x.Percentage).HasPrecision(7, 6);
            e.Property(x => x.FixedAmount).HasPrecision(18, 2);
            e.Property(x => x.Description).HasMaxLength(1000);
            e.HasOne(x => x.Bet).WithOne(x => x.Bonus).HasForeignKey<BetBonus>(x => x.BetId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<BankrollTransaction>(e =>
        {
            e.ToTable("BankrollTransactions", "betting");
            e.HasIndex(x => new { x.UserId, x.OccurredAtUtc });
            e.Property(x => x.UserId).HasMaxLength(450);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.TargetBalance).HasPrecision(18, 2);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Platform).WithMany().HasForeignKey(x => x.PlatformId).OnDelete(DeleteBehavior.Restrict);
        });
        builder.Entity<BettingToolExpense>(e =>
        {
            e.ToTable("ToolExpenses", "betting");
            e.HasIndex(x => new { x.UserId, x.IncurredAtUtc });
            e.Property(x => x.UserId).HasMaxLength(450);
            e.Property(x => x.ToolName).HasMaxLength(160);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Note).HasMaxLength(500);
            e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
