using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BuildFantasyTrackingAndPlayerAliases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BuyIn",
                schema: "fantasy",
                table: "Drafts",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAtUtc",
                schema: "fantasy",
                table: "Drafts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CurrencyCode",
                schema: "fantasy",
                table: "Drafts",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: false,
                defaultValue: "USD");

            migrationBuilder.AddColumn<int>(
                name: "DraftSlot",
                schema: "fantasy",
                table: "Drafts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EntrantCount",
                schema: "fantasy",
                table: "Drafts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "FinishingPlace",
                schema: "fantasy",
                table: "Drafts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                schema: "fantasy",
                table: "Drafts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "LeagueId",
                schema: "fantasy",
                table: "Drafts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                schema: "fantasy",
                table: "Drafts",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PlatformId",
                schema: "fantasy",
                table: "Drafts",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<int>(
                name: "RoundCount",
                schema: "fantasy",
                table: "Drafts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ScheduledAtUtc",
                schema: "fantasy",
                table: "Drafts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SportName",
                schema: "fantasy",
                table: "Drafts",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "Status",
                schema: "fantasy",
                table: "Drafts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "Winnings",
                schema: "fantasy",
                table: "Drafts",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "PlayerId",
                schema: "fantasy",
                table: "DraftPicks",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.CreateTable(
                name: "PlayerAliases",
                schema: "sports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(220)", maxLength: 220, nullable: false),
                    NormalizedName = table.Column<string>(type: "nvarchar(220)", maxLength: 220, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlayerAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlayerAliases_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalSchema: "sports",
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Workspaces",
                schema: "fantasy",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    StateJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Workspaces_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Drafts_LeagueId",
                schema: "fantasy",
                table: "Drafts",
                column: "LeagueId");

            migrationBuilder.CreateIndex(
                name: "IX_Drafts_PlatformId",
                schema: "fantasy",
                table: "Drafts",
                column: "PlatformId");

            migrationBuilder.CreateIndex(
                name: "IX_Drafts_UserId_Status",
                schema: "fantasy",
                table: "Drafts",
                columns: new[] { "UserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PlayerAliases_NormalizedName_PlayerId",
                schema: "sports",
                table: "PlayerAliases",
                columns: new[] { "NormalizedName", "PlayerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlayerAliases_PlayerId",
                schema: "sports",
                table: "PlayerAliases",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_UserId",
                schema: "fantasy",
                table: "Workspaces",
                column: "UserId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Drafts_Leagues_LeagueId",
                schema: "fantasy",
                table: "Drafts",
                column: "LeagueId",
                principalSchema: "sports",
                principalTable: "Leagues",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Drafts_Platforms_PlatformId",
                schema: "fantasy",
                table: "Drafts",
                column: "PlatformId",
                principalSchema: "betting",
                principalTable: "Platforms",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Drafts_Leagues_LeagueId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropForeignKey(
                name: "FK_Drafts_Platforms_PlatformId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropTable(
                name: "PlayerAliases",
                schema: "sports");

            migrationBuilder.DropTable(
                name: "Workspaces",
                schema: "fantasy");

            migrationBuilder.DropIndex(
                name: "IX_Drafts_LeagueId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropIndex(
                name: "IX_Drafts_PlatformId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropIndex(
                name: "IX_Drafts_UserId_Status",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "BuyIn",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "CompletedAtUtc",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "CurrencyCode",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "DraftSlot",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "EntrantCount",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "FinishingPlace",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "LeagueId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "Notes",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "PlatformId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "RoundCount",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "ScheduledAtUtc",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "SportName",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "Winnings",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.AlterColumn<Guid>(
                name: "PlayerId",
                schema: "fantasy",
                table: "DraftPicks",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
