using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RedesignBankrollAndAddToolExpenses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The legacy account-based ledger was never used. Clear any stray development rows
            // before replacing its ownership model and foreign keys.
            migrationBuilder.Sql("DELETE FROM [betting].[BankrollTransactions];");

            migrationBuilder.DropForeignKey(
                name: "FK_BankrollTransactions_BankrollAccounts_BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropForeignKey(
                name: "FK_Bets_BankrollAccounts_BankrollAccountId",
                schema: "betting",
                table: "Bets");

            migrationBuilder.DropTable(
                name: "BankrollAccounts",
                schema: "betting");

            migrationBuilder.DropIndex(
                name: "IX_Bets_BankrollAccountId",
                schema: "betting",
                table: "Bets");

            migrationBuilder.DropIndex(
                name: "IX_BankrollTransactions_BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "BankrollAccountId",
                schema: "betting",
                table: "Bets");

            migrationBuilder.DropColumn(
                name: "BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAtUtc",
                schema: "betting",
                table: "BankrollTransactions",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<Guid>(
                name: "PlatformId",
                schema: "betting",
                table: "BankrollTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetBalance",
                schema: "betting",
                table: "BankrollTransactions",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAtUtc",
                schema: "betting",
                table: "BankrollTransactions",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                schema: "betting",
                table: "BankrollTransactions",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ToolExpenses",
                schema: "betting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false),
                    ToolName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IncurredAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ToolExpenses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ToolExpenses_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankrollTransactions_PlatformId",
                schema: "betting",
                table: "BankrollTransactions",
                column: "PlatformId");

            migrationBuilder.CreateIndex(
                name: "IX_BankrollTransactions_UserId_OccurredAtUtc",
                schema: "betting",
                table: "BankrollTransactions",
                columns: new[] { "UserId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ToolExpenses_UserId_IncurredAtUtc",
                schema: "betting",
                table: "ToolExpenses",
                columns: new[] { "UserId", "IncurredAtUtc" });

            migrationBuilder.AddForeignKey(
                name: "FK_BankrollTransactions_AspNetUsers_UserId",
                schema: "betting",
                table: "BankrollTransactions",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_BankrollTransactions_Platforms_PlatformId",
                schema: "betting",
                table: "BankrollTransactions",
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
                name: "FK_BankrollTransactions_AspNetUsers_UserId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropForeignKey(
                name: "FK_BankrollTransactions_Platforms_PlatformId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropTable(
                name: "ToolExpenses",
                schema: "betting");

            migrationBuilder.DropIndex(
                name: "IX_BankrollTransactions_PlatformId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropIndex(
                name: "IX_BankrollTransactions_UserId_OccurredAtUtc",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "CreatedAtUtc",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "PlatformId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "TargetBalance",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "UpdatedAtUtc",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.DropColumn(
                name: "UserId",
                schema: "betting",
                table: "BankrollTransactions");

            migrationBuilder.AddColumn<Guid>(
                name: "BankrollAccountId",
                schema: "betting",
                table: "Bets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "BankrollAccounts",
                schema: "betting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CurrentBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankrollAccounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BankrollAccounts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Bets_BankrollAccountId",
                schema: "betting",
                table: "Bets",
                column: "BankrollAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_BankrollTransactions_BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions",
                column: "BankrollAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_BankrollAccounts_UserId_Name",
                schema: "betting",
                table: "BankrollAccounts",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_BankrollTransactions_BankrollAccounts_BankrollAccountId",
                schema: "betting",
                table: "BankrollTransactions",
                column: "BankrollAccountId",
                principalSchema: "betting",
                principalTable: "BankrollAccounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Bets_BankrollAccounts_BankrollAccountId",
                schema: "betting",
                table: "Bets",
                column: "BankrollAccountId",
                principalSchema: "betting",
                principalTable: "BankrollAccounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
