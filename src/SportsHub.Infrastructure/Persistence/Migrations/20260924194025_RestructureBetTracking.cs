using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations;

public partial class RestructureBetTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_Bets_Sportsbooks_SportsbookId",
            schema: "betting",
            table: "Bets");
        migrationBuilder.DropPrimaryKey(
            name: "PK_Sportsbooks",
            schema: "betting",
            table: "Sportsbooks");
        migrationBuilder.RenameTable(
            name: "Sportsbooks",
            schema: "betting",
            newName: "Platforms",
            newSchema: "betting");
        migrationBuilder.RenameIndex(
            name: "IX_Sportsbooks_Name",
            schema: "betting",
            table: "Platforms",
            newName: "IX_Platforms_Name");
        migrationBuilder.AddColumn<int>(
            name: "Type",
            schema: "betting",
            table: "Platforms",
            type: "int",
            nullable: false,
            defaultValue: 0);
        migrationBuilder.AddColumn<bool>(
            name: "IsActive",
            schema: "betting",
            table: "Platforms",
            type: "bit",
            nullable: false,
            defaultValue: true);
        migrationBuilder.Sql("UPDATE [betting].[Platforms] SET [Type] = 1;");
        migrationBuilder.AddPrimaryKey(
            name: "PK_Platforms",
            schema: "betting",
            table: "Platforms",
            column: "Id");

        migrationBuilder.RenameColumn(
            name: "WagerAmount",
            schema: "betting",
            table: "Bets",
            newName: "EntryCost");
        migrationBuilder.RenameColumn(
            name: "SportsbookId",
            schema: "betting",
            table: "Bets",
            newName: "PlatformId");
        migrationBuilder.RenameIndex(
            name: "IX_Bets_SportsbookId",
            schema: "betting",
            table: "Bets",
            newName: "IX_Bets_PlatformId");

        migrationBuilder.AddColumn<Guid>(name: "BankrollAccountId", schema: "betting", table: "Bets", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<int>(name: "CorrectLegCount", schema: "betting", table: "Bets", type: "int", nullable: true);
        migrationBuilder.AddColumn<string>(name: "CurrencyCode", schema: "betting", table: "Bets", type: "varchar(3)", unicode: false, maxLength: 3, nullable: false, defaultValue: "USD");
        migrationBuilder.AddColumn<decimal>(name: "DecimalOdds", schema: "betting", table: "Bets", type: "decimal(18,6)", precision: 18, scale: 6, nullable: true);
        migrationBuilder.AddColumn<decimal>(name: "EntryValue", schema: "betting", table: "Bets", type: "decimal(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>(name: "EstimatedProbability", schema: "betting", table: "Bets", type: "decimal(7,6)", precision: 7, scale: 6, nullable: true);
        migrationBuilder.AddColumn<int>(name: "LegCount", schema: "betting", table: "Bets", type: "int", nullable: false, defaultValue: 1);
        migrationBuilder.AddColumn<string>(name: "Notes", schema: "betting", table: "Bets", type: "nvarchar(2000)", maxLength: 2000, nullable: true);
        migrationBuilder.AddColumn<int>(name: "PayoutMode", schema: "betting", table: "Bets", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<Guid>(name: "SourceId", schema: "betting", table: "Bets", type: "uniqueidentifier", nullable: true);
        migrationBuilder.AddColumn<int>(name: "Timing", schema: "betting", table: "Bets", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<decimal>(name: "ActualPayout", schema: "betting", table: "Bets", type: "decimal(18,2)", precision: 18, scale: 2, nullable: true);

        migrationBuilder.CreateTable(
            name: "BetSources",
            schema: "betting",
            columns: table => new
            {
                Id = table.Column<Guid>("uniqueidentifier", nullable: false),
                UserId = table.Column<string>("nvarchar(450)", maxLength: 450, nullable: false),
                Name = table.Column<string>("nvarchar(160)", maxLength: 160, nullable: false),
                Type = table.Column<int>("int", nullable: false),
                IsActive = table.Column<bool>("bit", nullable: false, defaultValue: true),
                CreatedAtUtc = table.Column<DateTime>("datetime2", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>("datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BetSources", x => x.Id);
                table.ForeignKey(
                    name: "FK_BetSources_AspNetUsers_UserId",
                    column: x => x.UserId,
                    principalTable: "AspNetUsers",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "BetBonuses",
            schema: "betting",
            columns: table => new
            {
                Id = table.Column<Guid>("uniqueidentifier", nullable: false),
                BetId = table.Column<Guid>("uniqueidentifier", nullable: false),
                Type = table.Column<int>("int", nullable: false),
                Percentage = table.Column<decimal>("decimal(7,6)", precision: 7, scale: 6, nullable: true),
                FixedAmount = table.Column<decimal>("decimal(18,2)", precision: 18, scale: 2, nullable: true),
                Description = table.Column<string>("nvarchar(1000)", maxLength: 1000, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BetBonuses", x => x.Id);
                table.ForeignKey(
                    name: "FK_BetBonuses_Bets_BetId",
                    column: x => x.BetId,
                    principalSchema: "betting",
                    principalTable: "Bets",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "BetPayoutTiers",
            schema: "betting",
            columns: table => new
            {
                Id = table.Column<Guid>("uniqueidentifier", nullable: false),
                BetId = table.Column<Guid>("uniqueidentifier", nullable: false),
                RequiredCorrectLegs = table.Column<int>("int", nullable: false),
                BasePayoutAmount = table.Column<decimal>("decimal(18,2)", precision: 18, scale: 2, nullable: false),
                FinalPayoutAmount = table.Column<decimal>("decimal(18,2)", precision: 18, scale: 2, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BetPayoutTiers", x => x.Id);
                table.ForeignKey(
                    name: "FK_BetPayoutTiers_Bets_BetId",
                    column: x => x.BetId,
                    principalSchema: "betting",
                    principalTable: "Bets",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.Sql("""
            UPDATE b
            SET [EntryValue] = b.[EntryCost],
                [LegCount] = CASE WHEN legCounts.[Count] > 0 THEN legCounts.[Count] ELSE 1 END,
                [DecimalOdds] = CASE
                    WHEN b.[AmericanOdds] > 0 THEN 1 + CAST(b.[AmericanOdds] AS decimal(18,6)) / 100
                    WHEN b.[AmericanOdds] < 0 THEN 1 + 100 / ABS(CAST(b.[AmericanOdds] AS decimal(18,6)))
                    ELSE NULL
                END,
                [ActualPayout] = CASE
                    WHEN b.[ActualProfitLoss] IS NULL THEN NULL
                    WHEN b.[ActualProfitLoss] + b.[EntryCost] < 0 THEN 0
                    ELSE b.[ActualProfitLoss] + b.[EntryCost]
                END
            FROM [betting].[Bets] b
            OUTER APPLY (
                SELECT COUNT(*) AS [Count]
                FROM [betting].[BetLegs] l
                WHERE l.[BetId] = b.[Id]
            ) legCounts;

            INSERT INTO [betting].[BetPayoutTiers]
                ([Id], [BetId], [RequiredCorrectLegs], [BasePayoutAmount], [FinalPayoutAmount])
            SELECT NEWID(), [Id], [LegCount], [PotentialPayout], [PotentialPayout]
            FROM [betting].[Bets]
            WHERE [PotentialPayout] IS NOT NULL;
            """);

        migrationBuilder.DropColumn(name: "AmericanOdds", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "PotentialPayout", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "ActualProfitLoss", schema: "betting", table: "Bets");

        migrationBuilder.CreateIndex(name: "IX_Bets_BankrollAccountId", schema: "betting", table: "Bets", column: "BankrollAccountId");
        migrationBuilder.CreateIndex(name: "IX_Bets_SourceId", schema: "betting", table: "Bets", column: "SourceId");
        migrationBuilder.CreateIndex(name: "IX_Bets_UserId_Status", schema: "betting", table: "Bets", columns: new[] { "UserId", "Status" });
        migrationBuilder.CreateIndex(name: "IX_BetBonuses_BetId", schema: "betting", table: "BetBonuses", column: "BetId", unique: true);
        migrationBuilder.CreateIndex(name: "IX_BetPayoutTiers_BetId_RequiredCorrectLegs", schema: "betting", table: "BetPayoutTiers", columns: new[] { "BetId", "RequiredCorrectLegs" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_BetSources_UserId_Name", schema: "betting", table: "BetSources", columns: new[] { "UserId", "Name" }, unique: true);

        migrationBuilder.AddForeignKey(
            name: "FK_Bets_BankrollAccounts_BankrollAccountId",
            schema: "betting",
            table: "Bets",
            column: "BankrollAccountId",
            principalSchema: "betting",
            principalTable: "BankrollAccounts",
            principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);
        migrationBuilder.AddForeignKey(
            name: "FK_Bets_BetSources_SourceId",
            schema: "betting",
            table: "Bets",
            column: "SourceId",
            principalSchema: "betting",
            principalTable: "BetSources",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
        migrationBuilder.AddForeignKey(
            name: "FK_Bets_Platforms_PlatformId",
            schema: "betting",
            table: "Bets",
            column: "PlatformId",
            principalSchema: "betting",
            principalTable: "Platforms",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "FK_Bets_BankrollAccounts_BankrollAccountId", schema: "betting", table: "Bets");
        migrationBuilder.DropForeignKey(name: "FK_Bets_BetSources_SourceId", schema: "betting", table: "Bets");
        migrationBuilder.DropForeignKey(name: "FK_Bets_Platforms_PlatformId", schema: "betting", table: "Bets");

        migrationBuilder.AddColumn<int>(name: "AmericanOdds", schema: "betting", table: "Bets", type: "int", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<decimal>(name: "PotentialPayout", schema: "betting", table: "Bets", type: "decimal(18,2)", precision: 18, scale: 2, nullable: true);
        migrationBuilder.AddColumn<decimal>(name: "ActualProfitLoss", schema: "betting", table: "Bets", type: "decimal(18,2)", precision: 18, scale: 2, nullable: true);

        migrationBuilder.Sql("""
            UPDATE b
            SET [AmericanOdds] = CASE
                    WHEN b.[DecimalOdds] IS NULL OR b.[DecimalOdds] <= 1 THEN 0
                    WHEN b.[DecimalOdds] >= 2 THEN CAST(ROUND((b.[DecimalOdds] - 1) * 100, 0) AS int)
                    ELSE CAST(ROUND(-100 / (b.[DecimalOdds] - 1), 0) AS int)
                END,
                [PotentialPayout] = tier.[FinalPayoutAmount],
                [ActualProfitLoss] = CASE WHEN b.[ActualPayout] IS NULL THEN NULL ELSE b.[ActualPayout] - b.[EntryCost] END
            FROM [betting].[Bets] b
            OUTER APPLY (
                SELECT TOP (1) p.[FinalPayoutAmount]
                FROM [betting].[BetPayoutTiers] p
                WHERE p.[BetId] = b.[Id]
                ORDER BY p.[RequiredCorrectLegs] DESC
            ) tier;
            """);

        migrationBuilder.DropTable(name: "BetBonuses", schema: "betting");
        migrationBuilder.DropTable(name: "BetPayoutTiers", schema: "betting");
        migrationBuilder.DropTable(name: "BetSources", schema: "betting");
        migrationBuilder.DropIndex(name: "IX_Bets_BankrollAccountId", schema: "betting", table: "Bets");
        migrationBuilder.DropIndex(name: "IX_Bets_SourceId", schema: "betting", table: "Bets");
        migrationBuilder.DropIndex(name: "IX_Bets_UserId_Status", schema: "betting", table: "Bets");

        migrationBuilder.DropColumn(name: "BankrollAccountId", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "CorrectLegCount", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "CurrencyCode", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "DecimalOdds", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "EntryValue", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "EstimatedProbability", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "LegCount", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "Notes", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "PayoutMode", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "SourceId", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "Timing", schema: "betting", table: "Bets");
        migrationBuilder.DropColumn(name: "ActualPayout", schema: "betting", table: "Bets");

        migrationBuilder.RenameColumn(name: "EntryCost", schema: "betting", table: "Bets", newName: "WagerAmount");
        migrationBuilder.RenameColumn(name: "PlatformId", schema: "betting", table: "Bets", newName: "SportsbookId");
        migrationBuilder.RenameIndex(name: "IX_Bets_PlatformId", schema: "betting", table: "Bets", newName: "IX_Bets_SportsbookId");

        migrationBuilder.DropPrimaryKey(name: "PK_Platforms", schema: "betting", table: "Platforms");
        migrationBuilder.DropColumn(name: "Type", schema: "betting", table: "Platforms");
        migrationBuilder.DropColumn(name: "IsActive", schema: "betting", table: "Platforms");
        migrationBuilder.RenameTable(name: "Platforms", schema: "betting", newName: "Sportsbooks", newSchema: "betting");
        migrationBuilder.RenameIndex(name: "IX_Platforms_Name", schema: "betting", table: "Sportsbooks", newName: "IX_Sportsbooks_Name");
        migrationBuilder.AddPrimaryKey(name: "PK_Sportsbooks", schema: "betting", table: "Sportsbooks", column: "Id");
        migrationBuilder.AddForeignKey(
            name: "FK_Bets_Sportsbooks_SportsbookId",
            schema: "betting",
            table: "Bets",
            column: "SportsbookId",
            principalSchema: "betting",
            principalTable: "Sportsbooks",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }
}
