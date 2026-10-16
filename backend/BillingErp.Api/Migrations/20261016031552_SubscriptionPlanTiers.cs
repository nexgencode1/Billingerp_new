using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BillingErp.Api.Migrations
{
    /// <inheritdoc />
    public partial class SubscriptionPlanTiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "InvoiceLimit",
                table: "SubscriptionPlans",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceLimitPeriod",
                table: "SubscriptionPlans",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LockedFeatures",
                table: "SubscriptionPlans",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxUsers",
                table: "SubscriptionPlans",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Tier",
                table: "SubscriptionPlans",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InvoiceLimit",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "InvoiceLimitPeriod",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "LockedFeatures",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "MaxUsers",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "Tier",
                table: "SubscriptionPlans");
        }
    }
}
