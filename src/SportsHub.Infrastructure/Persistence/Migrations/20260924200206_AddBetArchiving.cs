using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBetArchiving : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAtUtc",
                schema: "betting",
                table: "Bets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                schema: "betting",
                table: "Bets",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Bets_UserId_IsArchived_PlacedAtUtc",
                schema: "betting",
                table: "Bets",
                columns: new[] { "UserId", "IsArchived", "PlacedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Bets_UserId_IsArchived_PlacedAtUtc",
                schema: "betting",
                table: "Bets");

            migrationBuilder.DropColumn(
                name: "ArchivedAtUtc",
                schema: "betting",
                table: "Bets");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                schema: "betting",
                table: "Bets");
        }
    }
}
