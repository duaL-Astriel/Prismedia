using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Prismedia.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTagAliases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tag_aliases",
                columns: table => new
                {
                    tag_id = table.Column<Guid>(type: "uuid", nullable: false),
                    alias = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tag_aliases", x => new { x.tag_id, x.alias });
                    table.ForeignKey(
                        name: "FK_tag_aliases_entities_tag_id",
                        column: x => x.tag_id,
                        principalTable: "entities",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tag_aliases_alias",
                table: "tag_aliases",
                column: "alias");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tag_aliases");
        }
    }
}
