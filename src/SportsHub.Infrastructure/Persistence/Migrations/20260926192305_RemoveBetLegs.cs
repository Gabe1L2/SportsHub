using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveBetLegs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BetLegs",
                schema: "betting");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BetLegs",
                schema: "betting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AmericanOdds = table.Column<int>(type: "int", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Line = table.Column<decimal>(type: "decimal(12,3)", precision: 12, scale: 3, nullable: true),
                    Type = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BetLegs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BetLegs_Bets_BetId",
                        column: x => x.BetId,
                        principalSchema: "betting",
                        principalTable: "Bets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BetLegs_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalSchema: "sports",
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BetLegs_BetId",
                schema: "betting",
                table: "BetLegs",
                column: "BetId");

            migrationBuilder.CreateIndex(
                name: "IX_BetLegs_PlayerId",
                schema: "betting",
                table: "BetLegs",
                column: "PlayerId");
        }
    }
}
