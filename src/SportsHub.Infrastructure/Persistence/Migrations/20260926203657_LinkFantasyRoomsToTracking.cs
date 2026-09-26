using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportsHub.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LinkFantasyRoomsToTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WorkspaceRoomId",
                schema: "fantasy",
                table: "Drafts",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Drafts_UserId_WorkspaceRoomId",
                schema: "fantasy",
                table: "Drafts",
                columns: new[] { "UserId", "WorkspaceRoomId" },
                unique: true,
                filter: "[WorkspaceRoomId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Drafts_UserId_WorkspaceRoomId",
                schema: "fantasy",
                table: "Drafts");

            migrationBuilder.DropColumn(
                name: "WorkspaceRoomId",
                schema: "fantasy",
                table: "Drafts");
        }
    }
}
