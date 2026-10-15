using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BillingErp.Api.Migrations
{
    /// <inheritdoc />
    public partial class SalesDocumentsAndCashBank : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ChallanCounter",
                table: "Businesses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ChallanPrefix",
                table: "Businesses",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "DC");

            migrationBuilder.AddColumn<int>(
                name: "EstimateCounter",
                table: "Businesses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "EstimatePrefix",
                table: "Businesses",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "EST");

            migrationBuilder.AddColumn<int>(
                name: "SaleOrderCounter",
                table: "Businesses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SaleOrderPrefix",
                table: "Businesses",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "SO");

            migrationBuilder.CreateTable(
                name: "MoneyAccounts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BankName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AccountNumber = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Ifsc = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OpeningBalance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MoneyAccounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SalesDocuments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    DocType = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    DocNumber = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    DocDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CustomerId = table.Column<int>(type: "int", nullable: true),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxableAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Cgst = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Sgst = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Igst = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConvertedSaleId = table.Column<int>(type: "int", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedById = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesDocuments_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDocuments_Sales_ConvertedSaleId",
                        column: x => x.ConvertedSaleId,
                        principalTable: "Sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDocuments_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CashBankTransactions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Date = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FromAccountId = table.Column<int>(type: "int", nullable: true),
                    ToAccountId = table.Column<int>(type: "int", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedById = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashBankTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CashBankTransactions_MoneyAccounts_FromAccountId",
                        column: x => x.FromAccountId,
                        principalTable: "MoneyAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashBankTransactions_MoneyAccounts_ToAccountId",
                        column: x => x.ToAccountId,
                        principalTable: "MoneyAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashBankTransactions_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesDocumentItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SalesDocumentId = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: false),
                    ProductName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Rate = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Discount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GstRate = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxableAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GstAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Total = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesDocumentItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesDocumentItems_Products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesDocumentItems_SalesDocuments_SalesDocumentId",
                        column: x => x.SalesDocumentId,
                        principalTable: "SalesDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CashBankTransactions_CreatedById",
                table: "CashBankTransactions",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_CashBankTransactions_Date",
                table: "CashBankTransactions",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_CashBankTransactions_FromAccountId",
                table: "CashBankTransactions",
                column: "FromAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CashBankTransactions_ToAccountId",
                table: "CashBankTransactions",
                column: "ToAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocumentItems_ProductId",
                table: "SalesDocumentItems",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocumentItems_SalesDocumentId",
                table: "SalesDocumentItems",
                column: "SalesDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocuments_ConvertedSaleId",
                table: "SalesDocuments",
                column: "ConvertedSaleId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocuments_CreatedById",
                table: "SalesDocuments",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocuments_CustomerId",
                table: "SalesDocuments",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocuments_DocNumber",
                table: "SalesDocuments",
                column: "DocNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesDocuments_DocType_DocDate",
                table: "SalesDocuments",
                columns: new[] { "DocType", "DocDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CashBankTransactions");

            migrationBuilder.DropTable(
                name: "SalesDocumentItems");

            migrationBuilder.DropTable(
                name: "MoneyAccounts");

            migrationBuilder.DropTable(
                name: "SalesDocuments");

            migrationBuilder.DropColumn(
                name: "ChallanCounter",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "ChallanPrefix",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "EstimateCounter",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "EstimatePrefix",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "SaleOrderCounter",
                table: "Businesses");

            migrationBuilder.DropColumn(
                name: "SaleOrderPrefix",
                table: "Businesses");
        }
    }
}
