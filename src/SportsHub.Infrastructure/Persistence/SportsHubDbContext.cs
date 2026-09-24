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
    public DbSet<Sportsbook> Sportsbooks => Set<Sportsbook>();
    public DbSet<Bet> Bets => Set<Bet>();
    public DbSet<BetLeg> BetLegs => Set<BetLeg>();
    public DbSet<BankrollAccount> BankrollAccounts => Set<BankrollAccount>();
    public DbSet<BankrollTransaction> BankrollTransactions => Set<BankrollTransaction>();

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
        builder.Entity<Sportsbook>(e => { e.ToTable("Sportsbooks", "betting"); e.HasIndex(x => x.Name).IsUnique(); e.Property(x => x.Name).HasMaxLength(120); });
        builder.Entity<Bet>(e => { e.ToTable("Bets", "betting"); e.HasIndex(x => new { x.UserId, x.PlacedAtUtc }); e.Property(x => x.UserId).HasMaxLength(450); e.Property(x => x.WagerAmount).HasPrecision(18, 2); e.Property(x => x.PotentialPayout).HasPrecision(18, 2); e.Property(x => x.ActualProfitLoss).HasPrecision(18, 2); e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Sportsbook).WithMany().HasForeignKey(x => x.SportsbookId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<BetLeg>(e => { e.ToTable("BetLegs", "betting"); e.Property(x => x.Description).HasMaxLength(500); e.Property(x => x.Line).HasPrecision(12, 3); e.HasOne(x => x.Bet).WithMany(x => x.Legs).HasForeignKey(x => x.BetId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Player).WithMany().HasForeignKey(x => x.PlayerId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<BankrollAccount>(e => { e.ToTable("BankrollAccounts", "betting"); e.HasIndex(x => new { x.UserId, x.Name }).IsUnique(); e.Property(x => x.UserId).HasMaxLength(450); e.Property(x => x.Name).HasMaxLength(120); e.Property(x => x.CurrentBalance).HasPrecision(18, 2); e.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); });
        builder.Entity<BankrollTransaction>(e => { e.ToTable("BankrollTransactions", "betting"); e.Property(x => x.Amount).HasPrecision(18, 2); e.Property(x => x.Note).HasMaxLength(500); e.HasOne(x => x.BankrollAccount).WithMany(x => x.Transactions).HasForeignKey(x => x.BankrollAccountId).OnDelete(DeleteBehavior.Restrict); });
    }
}
