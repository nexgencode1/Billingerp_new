import type { Metadata } from "next";
import { ExcelImportPanel } from "@/components/import/ExcelImportPanel";
import { HsnMasterTools } from "@/components/import/HsnMasterTools";

export const metadata: Metadata = { title: "Import Data" };

export default function ImportDataPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900">Import Data</h1>

      <ExcelImportPanel
        title="Import Products"
        templateFilename="product-import-template"
        templateColumns={["ProductName", "SKU", "Barcode", "Category", "Unit", "PurchasePrice", "SellingPrice", "GST", "OpeningStock", "MinimumStock"]}
        sampleRow={{
          ProductName: "Sample Product",
          SKU: "SKU-0001",
          Barcode: "",
          Category: "General",
          Unit: "Piece",
          PurchasePrice: 100,
          SellingPrice: 150,
          GST: 18,
          OpeningStock: 0,
          MinimumStock: 5,
        }}
        requiredColumns={["ProductName", "SKU", "Unit", "SellingPrice"]}
        importEndpoint="/api/import/products"
      />

      <ExcelImportPanel
        title="Import Customers"
        templateFilename="customer-import-template"
        templateColumns={["Name", "Mobile", "Email", "Address", "City", "State", "Pincode", "GSTIN", "OpeningBalance"]}
        sampleRow={{ Name: "Sample Customer", Mobile: "9999999999", Email: "", Address: "", City: "", State: "", Pincode: "", GSTIN: "", OpeningBalance: 0 }}
        requiredColumns={["Name", "Mobile"]}
        importEndpoint="/api/import/customers"
      />

      <ExcelImportPanel
        title="Import Suppliers"
        templateFilename="supplier-import-template"
        templateColumns={["Name", "Mobile", "Email", "Address", "City", "State", "Pincode", "GSTIN", "OpeningBalance"]}
        sampleRow={{ Name: "Sample Supplier", Mobile: "9999999999", Email: "", Address: "", City: "", State: "", Pincode: "", GSTIN: "", OpeningBalance: 0 }}
        requiredColumns={["Name", "Mobile"]}
        importEndpoint="/api/import/suppliers"
      />

      <ExcelImportPanel
        title="Import Opening Stock"
        templateFilename="opening-stock-import-template"
        templateColumns={["SKU", "OpeningStock"]}
        sampleRow={{ SKU: "SKU-0001", OpeningStock: 10 }}
        requiredColumns={["SKU", "OpeningStock"]}
        importEndpoint="/api/import/opening-stock"
      />

      <HsnMasterTools />
    </div>
  );
}
