using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddKellyMultiplier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "KellyMultiplier",
                table: "AspNetUsers",
                type: "decimal(5,4)",
                precision: 5,
                scale: 4,
                nullable: false,
                defaultValue: 0.25m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "KellyMultiplier",
                table: "AspNetUsers");
        }
    }
}
