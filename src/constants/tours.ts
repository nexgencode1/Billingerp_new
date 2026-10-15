import { TOUR_STEPS_EN, TOUR_STEPS_HI, type TourLanguage, type TourStep } from "@/constants/tour-steps";

// A bilingual step: [title, description] per language.
interface BiStep {
  target: string | null;
  page?: string;
  placement?: TourStep["placement"];
  en: [string, string];
  hi: [string, string];
}

export interface TourDefinition {
  id: string;
  title: { en: string; hi: string };
  description: { en: string; hi: string };
  /** Route prefixes this tour explains — used to suggest "tour this page". */
  match: string[];
}

// Which permission module a page belongs to — steps on pages the role can't open are dropped.
const PAGE_MODULES: [string, string][] = [
  ["/dashboard", "DASHBOARD"],
  ["/sales", "SALES"],
  ["/purchase", "PURCHASE"],
  ["/products", "PRODUCTS"],
  ["/inventory", "INVENTORY"],
  ["/customers", "CUSTOMERS"],
  ["/suppliers", "SUPPLIERS"],
  ["/crm", "CRM"],
  ["/hr", "HR"],
  ["/manufacturing", "MANUFACTURING"],
  ["/expenses", "EXPENSES"],
  ["/payments", "PAYMENTS"],
  ["/cash-bank", "PAYMENTS"],
  ["/reports", "REPORTS"],
  ["/users", "USERS"],
  ["/roles", "USERS"],
  ["/settings", "SETTINGS"],
];

export function moduleForPage(page: string | undefined): string | null {
  if (!page) return null;
  return PAGE_MODULES.find(([prefix]) => page === prefix || page.startsWith(`${prefix}/`))?.[1] ?? null;
}

// ---------- Module tours ----------
const MODULE_TOURS: (TourDefinition & { steps: BiStep[] })[] = [
  {
    id: "sales",
    title: { en: "Sales & Invoicing", hi: "सेल्स और बिलिंग" },
    description: { en: "Create a GST invoice, take payment, share & duplicate it", hi: "GST बिल बनाएं, पेमेंट लें, शेयर और डुप्लिकेट करें" },
    match: ["/sales/new", "/sales/invoices", "/sales/returns"],
    steps: [
      {
        target: "tour-customer-picker", page: "/sales/new", placement: "bottom",
        en: ["1. Pick the customer", "Search an existing customer or add a new one. Leave empty for a walk-in sale. The customer's state decides CGST+SGST vs IGST automatically."],
        hi: ["1. ग्राहक चुनें", "पुराना ग्राहक खोजें या नया जोड़ें। Walk-in के लिए खाली छोड़ें। ग्राहक के state से CGST+SGST या IGST अपने आप लगता है।"],
      },
      {
        target: "tour-product-search", page: "/sales/new", placement: "bottom",
        en: ["2. Add products", "Type a name, SKU or scan a barcode. Change qty, price, discount or GST % right in the table — red text warns when stock is short."],
        hi: ["2. प्रोडक्ट जोड़ें", "नाम, SKU लिखें या बारकोड स्कैन करें। टेबल में ही qty, rate, discount, GST बदलें — स्टॉक कम हो तो लाल चेतावनी दिखती है।"],
      },
      {
        target: "barcode-scan", page: "/sales/new", placement: "bottom",
        en: ["Scan barcodes", "A USB scanner works straight in the search box (scan → item added). No scanner? Tap Scan to use the phone / laptop camera."],
        hi: ["बारकोड स्कैन", "USB स्कैनर सीधे search box में काम करता है (स्कैन → आइटम जुड़ गया)। स्कैनर नहीं? Scan दबाकर फ़ोन/लैपटॉप कैमरा इस्तेमाल करें।"],
      },
      {
        target: "tour-payment-section", page: "/sales/new", placement: "top",
        en: ["3. Take payment", "Full, partial or credit — single method or split (cash + UPI...). Whatever isn't paid becomes the customer's due."],
        hi: ["3. पेमेंट लें", "पूरा, आधा या उधार — एक तरीका या split (कैश + UPI)। जो बाकी रहा वो ग्राहक का due बनता है।"],
      },
      {
        target: "tour-sales-history", page: "/sales/invoices", placement: "top",
        en: ["4. Every invoice, one click away", "Open any invoice to Print, download PDF, send on WhatsApp / Email, show a UPI QR for the due amount, or Duplicate it as a new bill."],
        hi: ["4. हर बिल यहाँ", "कोई भी बिल खोलें — Print, PDF, WhatsApp/Email पर भेजें, बाकी रकम का UPI QR दिखाएं या Duplicate करके नया बिल बनाएं।"],
      },
      {
        target: "new-recurring", page: "/sales/recurring", placement: "bottom",
        en: ["5. Recurring invoices", "Rent, AMC or a monthly supply? Set it once — the invoice is created automatically every week / month / quarter / year."],
        hi: ["5. रिकरिंग बिल", "किराया, AMC या हर महीने की सप्लाई? एक बार सेट करें — बिल हर हफ्ते/महीने/तिमाही/साल अपने आप बनेगा।"],
      },
      {
        target: null, page: "/sales/offline",
        en: ["6. Works offline", "Internet gone? Keep billing — invoices are saved on this device and sync automatically when the connection is back. Numbers are given at sync, so they stay gap-free."],
        hi: ["6. ऑफ़लाइन भी चलता है", "इंटरनेट चला गया? बिल बनाते रहें — बिल इसी डिवाइस में सेव होते हैं और नेट आते ही अपने आप sync हो जाते हैं। नंबर sync पर मिलता है, इसलिए बिना gap के।"],
      },
    ],
  },
  {
    id: "documents",
    title: { en: "Estimates, Orders & Challans", hi: "एस्टीमेट, ऑर्डर और चालान" },
    description: { en: "Quote first, convert to an invoice later", hi: "पहले कोटेशन, बाद में बिल" },
    match: ["/sales/estimates", "/sales/orders", "/sales/challans"],
    steps: [
      {
        target: "new-sales-document", page: "/sales/estimates", placement: "bottom",
        en: ["Estimates / Quotations", "Send a price quote with a valid-until date. Nothing touches stock or dues until you convert it."],
        hi: ["एस्टीमेट / कोटेशन", "Valid-until तारीख के साथ भाव भेजें। Convert करने तक स्टॉक या due पर कोई असर नहीं।"],
      },
      {
        target: "report-filters", page: "/sales/estimates", placement: "bottom",
        en: ["Filter & track", "Filter by period, status (Open / Converted / Cancelled) and customer. The cards show your quote-to-sale conversion rate."],
        hi: ["फ़िल्टर और ट्रैक", "Period, status (Open / Converted / Cancelled) और ग्राहक से फ़िल्टर करें। ऊपर conversion rate दिखता है।"],
      },
      {
        target: "new-sales-document", page: "/sales/orders", placement: "bottom",
        en: ["Sale Orders", "Record confirmed orders to deliver later. Open orders past their delivery date show up in the alert bell."],
        hi: ["सेल ऑर्डर", "पक्के ऑर्डर बाद में डिलीवरी के लिए दर्ज करें। तारीख निकल गई तो alert bell में दिखेगा।"],
      },
      {
        target: "new-sales-document", page: "/sales/challans", placement: "bottom",
        en: ["Delivery Challans → Invoice", "Send goods with a challan. On any open document, click 'Convert to Invoice' — the bill opens pre-filled and the document is marked Converted when you save."],
        hi: ["डिलीवरी चालान → बिल", "माल चालान के साथ भेजें। किसी भी open document पर 'Convert to Invoice' दबाएं — बिल पहले से भरा खुलेगा और save पर document Converted हो जाएगा।"],
      },
    ],
  },
  {
    id: "purchase",
    title: { en: "Purchase", hi: "परचेज़ (खरीद)" },
    description: { en: "Record supplier bills and pay suppliers", hi: "सप्लायर के बिल दर्ज करें और भुगतान करें" },
    match: ["/purchase"],
    steps: [
      {
        target: "nav-purchase", page: "/purchase/new", placement: "right",
        en: ["New Purchase", "Every purchase adds stock automatically and records input GST."],
        hi: ["नई खरीद", "हर खरीद से स्टॉक अपने आप बढ़ता है और input GST दर्ज होता है।"],
      },
      {
        target: "tour-supplier-picker", page: "/purchase/new", placement: "bottom",
        en: ["Pick the supplier", "Choose the supplier, add items at purchase price and record what you paid — the rest becomes payable."],
        hi: ["सप्लायर चुनें", "सप्लायर चुनें, खरीद भाव पर आइटम जोड़ें और जितना दिया वो दर्ज करें — बाकी payable बनता है।"],
      },
      {
        target: null, page: "/purchase/returns",
        en: ["Debit Note (Purchase Return)", "Returning goods to a supplier? Create a debit note here — stock goes back out automatically."],
        hi: ["डेबिट नोट (परचेज़ रिटर्न)", "सप्लायर को माल वापस? यहाँ debit note बनाएं — स्टॉक अपने आप घटेगा।"],
      },
    ],
  },
  {
    id: "stock",
    title: { en: "Products & Inventory", hi: "प्रोडक्ट और स्टॉक" },
    description: { en: "Item master, stock levels, adjustments", hi: "आइटम, स्टॉक लेवल, एडजस्टमेंट" },
    match: ["/products", "/inventory"],
    steps: [
      {
        target: "tour-add-product", page: "/products", placement: "bottom",
        en: ["Add products", "Set selling & purchase price, GST %, HSN (with suggestions as you type the name), unit and a minimum stock level for low-stock alerts."],
        hi: ["प्रोडक्ट जोड़ें", "बिक्री और खरीद भाव, GST %, HSN, unit और low-stock alert के लिए minimum stock सेट करें।"],
      },
      {
        target: null, page: "/products/labels",
        en: ["Barcode labels", "Print sticker sheets (24 / 40 / 14 per A4) with name, price and a scannable barcode for every product."],
        hi: ["बारकोड लेबल", "हर प्रोडक्ट के लिए नाम, कीमत और स्कैन होने वाले बारकोड के साथ स्टिकर शीट (24/40/14 प्रति A4) प्रिंट करें।"],
      },
      {
        target: "nav-inventory", page: "/inventory/stock", placement: "right",
        en: ["Live stock", "Stock is calculated from every sale, purchase, return and adjustment — never typed in by hand."],
        hi: ["लाइव स्टॉक", "स्टॉक हर बिक्री, खरीद, रिटर्न और एडजस्टमेंट से अपने आप गिना जाता है।"],
      },
      {
        target: "header-alerts", page: "/inventory/low-stock", placement: "bottom",
        en: ["Low stock alerts", "The bell shows products at or below their minimum level, so you can reorder in time."],
        hi: ["कम स्टॉक अलर्ट", "घंटी में वो प्रोडक्ट दिखते हैं जो minimum level पर या उससे नीचे हैं — समय पर ऑर्डर करें।"],
      },
    ],
  },
  {
    id: "parties",
    title: { en: "Customers & Suppliers", hi: "ग्राहक और सप्लायर" },
    description: { en: "Parties, ledgers and dues", hi: "पार्टी, लेजर और बकाया" },
    match: ["/customers", "/suppliers"],
    steps: [
      {
        target: "tour-customers", page: "/customers", placement: "top",
        en: ["Customers", "Each customer shows total sales, paid and due. Open the ledger to see every bill and payment with a running balance."],
        hi: ["ग्राहक", "हर ग्राहक की कुल बिक्री, जमा और बकाया। Ledger खोलें — हर बिल और पेमेंट running balance के साथ।"],
      },
      {
        target: null, page: "/customers",
        en: ["Customer portal", "Click the key icon on a customer to give them their own login: they can see their bills, payments and balance, download PDFs and pay by UPI — at /portal."],
        hi: ["कस्टमर पोर्टल", "ग्राहक के आगे चाबी वाले icon से उन्हें अपना login दें: वो अपने बिल, पेमेंट और बकाया देख सकते हैं, PDF ले सकते हैं और UPI से पे कर सकते हैं — /portal पर।"],
      },
      {
        target: "tour-suppliers", page: "/suppliers", placement: "top",
        en: ["Suppliers", "Same for suppliers — what you bought, what you paid and what you still owe."],
        hi: ["सप्लायर", "सप्लायर के लिए भी — कितना खरीदा, कितना दिया और कितना बाकी।"],
      },
    ],
  },
  {
    id: "money",
    title: { en: "Payments, Cash & Bank", hi: "पेमेंट, कैश और बैंक" },
    description: { en: "Receive / pay, cash in hand, bank balances", hi: "पैसे लें/दें, कैश और बैंक बैलेंस" },
    match: ["/payments", "/cash-bank", "/expenses"],
    steps: [
      {
        target: "tour-payments", page: "/payments", placement: "top",
        en: ["Receive & pay", "Record money received against a customer bill or paid against a supplier bill — dues update instantly."],
        hi: ["पैसे लें और दें", "ग्राहक के बिल पर मिला पैसा या सप्लायर को दिया पैसा दर्ज करें — बकाया तुरंत अपडेट।"],
      },
      {
        target: null, page: "/payments/reminders",
        en: ["Payment reminders", "Everyone who owes you, oldest first. Send a reminder on WhatsApp in one click, or by email (automatic daily emails can be switched on)."],
        hi: ["पेमेंट रिमाइंडर", "जिन पर बकाया है, सबसे पुराने पहले। एक क्लिक में WhatsApp पर रिमाइंडर भेजें, या ईमेल से (रोज़ automatic ईमेल भी चालू कर सकते हैं)।"],
      },
      {
        target: "cash-bank-accounts", page: "/cash-bank", placement: "bottom",
        en: ["Cash & Bank balances", "Cash payments land in Cash in Hand; UPI, card and bank go to your default bank account. Click an account for its full statement."],
        hi: ["कैश और बैंक बैलेंस", "कैश पेमेंट Cash in Hand में, UPI/कार्ड/बैंक default bank account में। पूरा statement देखने के लिए account पर क्लिक करें।"],
      },
      {
        target: "cash-bank-transfer", page: "/cash-bank", placement: "bottom",
        en: ["Deposit, withdraw, adjust", "Moved cash to the bank or took cash out? Record it here so both balances stay correct."],
        hi: ["जमा, निकासी, एडजस्ट", "कैश बैंक में जमा किया या निकाला? यहाँ दर्ज करें ताकि दोनों बैलेंस सही रहें।"],
      },
      {
        target: "tour-expenses", page: "/expenses", placement: "top",
        en: ["Expenses", "Rent, salary, electricity… every expense reduces cash or bank and shows in Profit & Loss."],
        hi: ["खर्चे", "किराया, सैलरी, बिजली… हर खर्च कैश या बैंक घटाता है और Profit & Loss में दिखता है।"],
      },
    ],
  },
  {
    id: "reports",
    title: { en: "Reports", hi: "रिपोर्ट्स" },
    description: { en: "Filters, charts, print & download", hi: "फ़िल्टर, ग्राफ, प्रिंट और डाउनलोड" },
    match: ["/reports"],
    steps: [
      {
        target: "reports-download-all", page: "/reports", placement: "bottom",
        en: ["All reports in one file", "Pick a period and download every report together — one Excel workbook (a sheet per report) or one PDF."],
        hi: ["सारी रिपोर्ट एक फ़ाइल में", "Period चुनें और सारी रिपोर्ट एक साथ डाउनलोड करें — एक Excel (हर रिपोर्ट की अलग शीट) या एक PDF।"],
      },
      {
        target: null, page: "/reports/ask",
        en: ["Ask your business", "Type a question like \"last month profit\" or \"kaun kaun par udhar baki hai\" — the answer comes from your own reports. Install Ollama (free) for full AI understanding."],
        hi: ["अपने बिज़नेस से पूछें", "\"pichhle mahine ka munafa\" या \"kaun kaun par udhar baki hai\" जैसा सवाल लिखें — जवाब आपकी अपनी रिपोर्ट से आता है। पूरे AI के लिए Ollama (free) install करें।"],
      },
      {
        target: "report-filters", page: "/reports/sales", placement: "bottom",
        en: ["Common filters", "Every report has the same filter bar: Today, This Month, Financial Year (Apr–Mar), custom dates, plus report-specific filters like customer or status."],
        hi: ["कॉमन फ़िल्टर", "हर रिपोर्ट में एक जैसा filter: आज, इस महीने, Financial Year (अप्रैल–मार्च), custom तारीख और customer/status जैसे filter।"],
      },
      {
        target: "report-actions", page: "/reports/sales", placement: "bottom",
        en: ["Print & download", "Print or download the full report — summary plus every row — as Excel or PDF."],
        hi: ["प्रिंट और डाउनलोड", "पूरी रिपोर्ट — summary और सारी rows — Print करें या Excel/PDF में डाउनलोड करें।"],
      },
      {
        target: "gstr1-json", page: "/reports/gstr", placement: "bottom",
        en: ["GSTR-1 & GSTR-3B", "B2B / B2C / HSN summary and tax payable for the month, ready as Excel, PDF or GSTR-1 JSON. Always validate with the official tool before filing."],
        hi: ["GSTR-1 और GSTR-3B", "महीने का B2B / B2C / HSN summary और देय टैक्स — Excel, PDF या GSTR-1 JSON में। फ़ाइल करने से पहले official tool से ज़रूर जाँचें।"],
      },
      {
        target: null, page: "/reports/day-book",
        en: ["Day Book", "Everything that happened on a day — bills, payments, expenses, transfers — with money in and out."],
        hi: ["डे बुक", "एक दिन में हुआ सब कुछ — बिल, पेमेंट, खर्च, ट्रांसफर — पैसा आया और गया।"],
      },
      {
        target: null, page: "/reports/balance-sheet",
        en: ["Balance Sheet", "What the business owns (cash, bank, debtors, stock) vs what it owes (creditors, GST) — as of today."],
        hi: ["बैलेंस शीट", "बिज़नेस के पास क्या है (कैश, बैंक, देनदार, स्टॉक) और क्या देना है (लेनदार, GST) — आज की तारीख तक।"],
      },
    ],
  },
  {
    id: "business",
    title: { en: "CRM, HR & Manufacturing", hi: "CRM, HR और मैन्युफैक्चरिंग" },
    description: { en: "Leads, staff & payroll, production", hi: "लीड्स, स्टाफ और सैलरी, प्रोडक्शन" },
    match: ["/crm", "/hr", "/manufacturing"],
    steps: [
      {
        target: "tour-crm", page: "/crm/leads", placement: "top",
        en: ["Leads", "Track enquiries through New → Contacted → Proposal → Won/Lost, with a follow-up timeline per lead."],
        hi: ["लीड्स", "पूछताछ को New → Contacted → Proposal → Won/Lost तक ट्रैक करें, हर लीड की follow-up timeline के साथ।"],
      },
      {
        target: "tour-hr", page: "/hr/employees", placement: "top",
        en: ["Staff, attendance & payroll", "Add employees, mark daily attendance and generate monthly payroll."],
        hi: ["स्टाफ, हाज़िरी और सैलरी", "कर्मचारी जोड़ें, रोज़ की हाज़िरी लगाएं और महीने की सैलरी बनाएं।"],
      },
      {
        target: "tour-manufacturing", page: "/manufacturing/bom", placement: "top",
        en: ["Manufacturing", "Define a bill of materials, then production orders consume components and add finished goods to stock."],
        hi: ["मैन्युफैक्चरिंग", "BOM बनाएं — production order से कच्चा माल घटेगा और तैयार माल स्टॉक में जुड़ेगा।"],
      },
    ],
  },
  {
    id: "settings",
    title: { en: "Settings & Data", hi: "सेटिंग्स और डेटा" },
    description: { en: "Business profile, numbering, backup, demo data", hi: "बिज़नेस प्रोफाइल, नंबरिंग, बैकअप, डेमो डेटा" },
    match: ["/settings", "/users", "/roles"],
    steps: [
      {
        target: "tour-settings", page: "/settings/business", placement: "top",
        en: ["Business profile", "Your name, GSTIN, state (decides CGST/SGST vs IGST), bank details and UPI ID (shown as a QR on invoices)."],
        hi: ["बिज़नेस प्रोफाइल", "नाम, GSTIN, state (CGST/SGST या IGST तय करता है), बैंक डिटेल और UPI ID (बिल पर QR बनकर दिखती है)।"],
      },
      {
        target: null, page: "/settings/number-series",
        en: ["Number series", "Change prefixes for invoices, estimates, orders, challans, credit/debit notes. Numbers stay gap-free."],
        hi: ["नंबर सीरीज़", "बिल, एस्टीमेट, ऑर्डर, चालान, क्रेडिट/डेबिट नोट के prefix बदलें। नंबर बिना gap के चलते हैं।"],
      },
      {
        target: "demo-data", page: "/settings/backup", placement: "top",
        en: ["Backup & demo data", "Download / restore a full backup, or load 6 months of sample data to try every report."],
        hi: ["बैकअप और डेमो डेटा", "पूरा बैकअप डाउनलोड/रिस्टोर करें, या हर रिपोर्ट आज़माने के लिए 6 महीने का सैंपल डेटा लोड करें।"],
      },
      {
        target: "auto-backup", page: "/settings/backup", placement: "top",
        en: ["Automatic daily backup", "A full backup is saved every night. Point the folder at Google Drive / OneDrive for free cloud backup."],
        hi: ["रोज़ का ऑटो बैकअप", "हर रात पूरा बैकअप अपने आप सेव होता है। फ़्री क्लाउड बैकअप के लिए फ़ोल्डर को Google Drive / OneDrive में रखें।"],
      },
      {
        target: null, page: "/settings/import",
        en: ["Import data & HSN list", "Bring in products, customers, suppliers from Excel — and the official HSN/SAC list so product HSN + GST suggestions work."],
        hi: ["डेटा और HSN लिस्ट इम्पोर्ट", "Excel से प्रोडक्ट, ग्राहक, सप्लायर लाएं — और official HSN/SAC लिस्ट ताकि HSN + GST सुझाव मिलें।"],
      },
      {
        target: null, page: "/settings/audit-log",
        en: ["Audit log", "Who created, edited, cancelled or deleted what, and when — filter by user, module and date."],
        hi: ["ऑडिट लॉग", "किसने क्या बनाया, बदला, कैंसिल या डिलीट किया, और कब — user, module और तारीख से फ़िल्टर करें।"],
      },
      {
        target: "tour-users", page: "/users", placement: "top",
        en: ["Users & roles", "Add staff logins and control exactly what each role can view, create, edit, delete, export and print."],
        hi: ["यूज़र्स और रोल्स", "स्टाफ लॉगिन बनाएं और तय करें कि हर role क्या देख, बना, बदल, हटा, export और print कर सकता है।"],
      },
    ],
  },
];

// ---------- Full tour = original walkthrough + the newer features ----------
const FULL_EXTRA: { after: string; step: BiStep }[] = [
  {
    after: "dashboard-kpis",
    step: {
      target: "dashboard-insights", page: "/dashboard", placement: "top",
      en: ["Business insights", "This period vs the last one, 12-month trend, top products & customers, and how old your unpaid dues are."],
      hi: ["बिज़नेस इनसाइट्स", "इस period बनाम पिछला, 12 महीने का trend, टॉप प्रोडक्ट व ग्राहक, और बकाया कितना पुराना है।"],
    },
  },
  {
    after: "header-profile",
    step: {
      target: "header-alerts", page: "/dashboard", placement: "bottom",
      en: ["Alerts", "Low stock, bills overdue for 30+ days and expired quotes/orders appear here."],
      hi: ["अलर्ट", "कम स्टॉक, 30+ दिन पुराने बकाया बिल और expired कोटेशन/ऑर्डर यहाँ दिखते हैं।"],
    },
  },
  {
    after: "tour-sales-history",
    step: {
      target: "new-sales-document", page: "/sales/estimates", placement: "bottom",
      en: ["Estimates, Orders & Challans", "Quote first, then convert to an invoice in one click when the customer confirms."],
      hi: ["एस्टीमेट, ऑर्डर और चालान", "पहले कोटेशन भेजें, ग्राहक माने तो एक क्लिक में बिल बनाएं।"],
    },
  },
  {
    after: "tour-payments",
    step: {
      target: "cash-bank-accounts", page: "/cash-bank", placement: "bottom",
      en: ["Cash & Bank", "Cash in hand and every bank balance, worked out from your payments, expenses and transfers."],
      hi: ["कैश और बैंक", "हाथ में कैश और हर बैंक बैलेंस — पेमेंट, खर्च और ट्रांसफर से अपने आप।"],
    },
  },
];

function toStep(s: BiStep, lang: TourLanguage): TourStep {
  const [title, description] = s[lang];
  return { target: s.target, page: s.page, placement: s.placement, title, description };
}

function fullTour(lang: TourLanguage): TourStep[] {
  const base = (lang === "hi" ? TOUR_STEPS_HI : TOUR_STEPS_EN).map((s) =>
    s.target === "nav-reports" ? { ...s, page: "/reports" } : s
  );
  const out: TourStep[] = [];
  for (const step of base) {
    out.push(step);
    for (const extra of FULL_EXTRA) if (extra.after === step.target) out.push(toStep(extra.step, lang));
  }
  return out;
}

export const FULL_TOUR: TourDefinition = {
  id: "full",
  title: { en: "Complete walkthrough", hi: "पूरा टूर" },
  description: { en: "Every section, start to finish (~5 min)", hi: "हर सेक्शन, शुरू से आखिर तक (~5 मिनट)" },
  match: [],
};

export const MODULE_TOUR_LIST: TourDefinition[] = MODULE_TOURS.map((t) => ({ id: t.id, title: t.title, description: t.description, match: t.match }));

// Steps for a tour in a language, keeping only steps whose page the role can open. A tour whose
// steps are all filtered out returns [] (the menu hides it).
export function buildTour(tourId: string, lang: TourLanguage, can: (module: string) => boolean): TourStep[] {
  const steps = tourId === "full" ? fullTour(lang) : (MODULE_TOURS.find((t) => t.id === tourId)?.steps ?? []).map((s) => toStep(s, lang));
  const allowed = steps.filter((s) => {
    const pageModule = moduleForPage(s.page);
    return pageModule === null || can(pageModule);
  });
  // A tour that is only intro/outro cards (no real step left) isn't worth showing.
  return allowed.some((s) => s.page) ? allowed : [];
}

export function suggestedTourFor(pathname: string): string | null {
  return MODULE_TOURS.find((t) => t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)))?.id ?? null;
}
