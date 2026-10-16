# Billing ERP

Full ERP system: Billing / Inventory / Accounting (the original spec) plus CRM, HR & Payroll,
and Manufacturing. **Two-project architecture**: Next.js (App Router) + TypeScript + Tailwind CSS
frontend, and a separate **.NET Core Web API + SQL Server backend** (`backend/BillingErp.Api`).
This is a migration from an earlier single-codebase version (Next.js API routes + Prisma +
SQLite) — that version is archived at `~/billing-software-archive/` (outside this repo) for
reference; it is not part of the running app anymore.

> **Read `AGENTS.md` first.** This Next.js version (16.3.4) has changes that can diverge from an
> LLM's training data — verify against installed versions / actual behavior rather than assuming
> from memory. The same caution applies to whatever .NET SDK is installed (currently .NET 10).

## Running it

Two processes, both required:

```bash
# Terminal 1 — backend (SQL Server Express instance ".\SQLEXPRESS", database BillingErpDb)
cd backend/BillingErp.Api
dotnet ef database update      # only needed after an entity/migration change
ASPNETCORE_ENVIRONMENT=Development dotnet run --no-launch-profile --urls "http://localhost:5215"
# ^ on startup this also applies every Data/StoredProcedures/*.sql file and reseeds base data —
#   both steps are idempotent, safe to run every time.

# Terminal 2 — frontend
npm install
npm run dev                    # http://localhost:3000, proxies /api/* to the backend above
```

`next.config.ts`'s `rewrites()` proxies every `/api/*` call from the browser straight through to
the backend (`BACKEND_URL` env var, default `http://localhost:5215`) — the browser only ever talks
to the Next.js origin, so no CORS setup is needed and the `billing_session` cookie flows through
untouched in both directions.

Other useful commands: `npm run lint`, `npx tsc --noEmit` (frontend); `dotnet build`,
`dotnet ef migrations add <Name>` (backend, run from `backend/BillingErp.Api`).

**Seeded logins** (from `Data/DbSeeder.cs`, applied automatically on backend startup):
- `admin@business.local` / `Admin@123` — ADMIN (full access)
- `cashier@business.local` / `Cashier@123` — CASHIER (limited nav, per the Roles matrix)

## Architecture

- **Two separate processes, one browser-visible origin**: the Next.js dev/prod server is what the
  browser talks to; it transparently proxies `/api/*` to the .NET backend via `rewrites()`. Server
  Components that need data directly (not through client-side `fetch`) use `src/lib/serverApi.ts`,
  which calls the backend directly (bypassing the proxy, since a Next.js Server Component has no
  browser "current origin" to resolve a relative URL against) and manually forwards the
  `billing_session` cookie so `[RequirePermission]` still applies.
- **Auth**: custom JWT (via `jose` on the Next.js side, `System.IdentityModel.Tokens.Jwt` on the
  .NET side), HS256, shared secret (`JWT_SECRET` in `.env` / `Jwt:Secret` in the backend's
  `appsettings.Development.json` — **must stay identical on both sides**). The token's claims are a
  flat `{ userId, name, email, roleId, roleName, iat, exp }` shape (`src/types/auth.ts`'s
  `SessionPayload` / `Auth/SessionPayload.cs`) — the backend's `TokenService` builds this manually
  rather than via `ClaimsIdentity`/`ClaimTypes.*`, which would otherwise get remapped to long URIs
  by `JwtSecurityTokenHandler`'s default claim-type map and break `jose`'s parsing.
  `src/middleware.ts` (page-route login gate, checks only "is this cookie valid") is unchanged from
  before the migration — it doesn't care which backend issued the token.
- **Server-side permission enforcement**: every backend endpoint has a
  `[RequirePermission("MODULE", "ACTION")]` attribute (`Auth/RequirePermissionAttribute.cs`) that
  checks the caller's role against the `RolePermission` table — this is enforced on the API itself,
  not just nav-level hiding (`Sidebar.tsx`/`MobileNav.tsx` additionally hide nav items the role
  can't use, but that's UX, not the security boundary).
- **Everything goes through stored procedures** — this is the core architectural decision of the
  .NET backend. EF Core (`Data/AppDbContext.cs`, `Data/Entities/*.cs`) is **schema/migrations
  only**; there is no LINQ querying at runtime. Every controller uses Dapper
  (`Data/SqlConnectionFactory.cs`) to call a stored procedure under `Data/StoredProcedures/*.sql`.
  Naming convention: `sp_<Entity>_<Operation>` (e.g. `sp_Product_List`, `sp_Sale_Create`). Each
  `.sql` file is exactly one `CREATE OR ALTER PROCEDURE` statement (no `GO` batches) —
  `Data/SqlScriptRunner.cs` applies every file in that folder on backend startup automatically.
  Partial-update endpoints follow a COALESCE-per-field pattern (see `sp_Product_Update.sql`), with
  an `@XxxProvided BIT` companion parameter for genuinely-nullable columns like `Status` — the one
  known limitation of this pattern is that a nullable column can't be explicitly cleared back to
  `NULL` through these endpoints (only set to a new value or left untouched).
- **Stock ledger**: `StockTransaction` is the single source of truth for "current stock" — never a
  cached counter on `Product`. Every stock-moving action calls `sp_Stock_RecordTransaction` (via
  `Services/StockService.cs`), which locks the product's existing rows
  (`WITH (UPDLOCK, HOLDLOCK)`) and re-derives the running balance from the sum of all prior
  transactions — this row-locking is a deliberate concurrency-safety addition over the original
  SQLite version, which had no equivalent locking.
- **Numbering** (invoice/purchase/payment/etc.): `sp_Numbering_GetNext` (via
  `Services/NumberingService.cs`) locks the single `Business` settings row and increments the
  relevant counter column inside the caller's own transaction — same locking-for-concurrency
  addition as the stock ledger.
- **GST / totals math**: `Services/GstService.cs` (`ComputeInvoiceTotals`, `SplitGst`,
  `AmountInWords`) is a pure C# port of the original `lib/gst.ts`, shared by Sales and Purchase.
  This calculation intentionally stays in C# rather than T-SQL (the stored-procedure rule applies
  to *data access*, not pure arithmetic that touches no tables) — the SP that persists a sale/
  purchase receives the already-computed totals as parameters.
- **Money**: `decimal(18,2)` in SQL Server (upgraded from SQLite's untyped `Float` during the
  migration — a safe, non-breaking type change since JSON still serializes it as a plain number).
- **Audit log**: `Services/AuditService.cs`'s `LogAsync()` (→ `sp_Audit_Log`) is called from most
  mutating endpoints but isn't exhaustive, matching the original's coverage.
- **Reports**: every `sp_Report_*` takes optional filter params (default `NULL` = no filter) and
  `sp_Report_Trend` gives period-bucketed totals for charts. Frontend: `src/lib/reports.ts` holds
  each report's types + export-document builder (shared by the report pages and the `/reports`
  "download all" hub); `src/lib/reportExport.ts` renders those to Excel/PDF/print;
  `ReportFilterBar` (period presets incl. Indian FY) is the common filter UI.
- **Demo data** (`/settings/backup` → Load Demo Data, `POST /api/demo/load`): `Services/
  DemoDataService.cs` replays ~6 months of history through the *real* SPs inside one transaction;
  demo products have SKU prefix `DEMO-` (that's how `sp_Demo_Status` detects it). Note: stock
  ledger rows get the load time as `CreatedAt`, not the backdated document date.
- **Estimates / Sale Orders / Delivery Challans**: one `SalesDocuments` table (`DocType`), routes
  `/sales/[kind]` (`estimates|orders|challans`). They never move stock or dues. "Convert to
  Invoice" opens `/sales/new?fromDocument=<id>` pre-filled; `POST /api/sales` with
  `sourceDocumentId` makes `sp_Sale_Create` mark the document CONVERTED in the same transaction
  (THROW 51003 → 400 if it's no longer OPEN). `/sales/new?duplicate=<saleId>` copies an invoice.
  Credit/Debit Notes are the existing Sale/Purchase Returns, relabelled (as Vyapar does).
- **Cash & Bank**: `MoneyAccounts` + `CashBankTransactions`; balances are derived, never stored.
  `Data/StoredProcedures/fn_CashBank_Movements.sql` is the one deliberate non-procedure script (an
  inline TVF; its name sorts before `sp_*` so it's created first) — routing rule: method CASH →
  the CASH account, UPI/CARD/BANK → the default BANK account, CREDIT/"Store Credit" → no money.
  Day Book (`sp_Report_DayBook`) and Balance Sheet (`sp_Report_BalanceSheet`, simplified, capital
  = balancing figure) read from it.
- **Business row is read by column list, not `SELECT *`**: `BusinessController` maps onto a
  positional record, so adding a `Businesses` column means updating `sp_Business_Get`,
  `sp_Business_Update` and that record together.
- **Alerts bell** (`/api/alerts`, `sp_Alerts_Summary`): low stock, sales due > `Alerts:OverdueDays`
  (appsettings, default 30), expired open estimates/orders — sections filtered by role.
- **Client permissions**: `src/lib/permissions-context.tsx` (`useCan`) exposes `/api/auth/me`'s
  map to client components for hiding buttons — UX only, backend still enforces.
- **Tours**: `src/constants/tours.ts` — per-module tours + the full walkthrough, EN/HI; steps on
  pages the role can't VIEW are dropped (module derived from the step's page).
- **Sharing**: WhatsApp (`wa.me` link) / Email (`mailto:`) / UPI QR (`qrcode` npm, `upi://pay`) —
  all free, open the user's own apps; payment confirmation stays manual.
- **Sale creation lives in `Services/SaleService.cs`** (moved out of `SalesController.Create`) —
  the one path used by POST `/api/sales` and by `RecurringInvoiceWorker`. Don't duplicate it.
- **GST compliance config**: `backend/BillingErp.Api/Config/gst.json` (loaded in `Program.cs`,
  read via `Services/GstConfig.cs`) holds state codes, the B2CL threshold, UQC map and the GSTR-1
  JSON version — every value is `// VERIFY`. `GstReturnsController` (`/api/gst/gstr1|gstr3b`)
  formats sales/purchases into GSTR-1 (B2B/B2CL/B2CS/HSN/docs + portal-style JSON) and a simplified
  GSTR-3B; credit notes are listed but not in the JSON (sale returns have no tax split). HSN in
  the HSN summary is the product's *current* HSN (no snapshot on SaleItems).
- **HSN master** (`HsnCodes`, PK = Code): the app ships no codes/rates — admins import the official
  list (Settings → Import, bulk `MERGE` via `sp_Hsn_ImportBulk`). Product form suggestions come from
  that list + HSN/rates already used on your own products (`sp_Hsn_Suggest`).
- **Background jobs** (`BackgroundService`, registered in `Program.cs`): `RecurringInvoiceWorker`
  (every `Recurring:IntervalMinutes`, catches up missed occurrences, max 12/pass; occurrence n is
  computed from StartDate so month-ends don't drift) and `ReminderWorker` (daily email reminders —
  only if `Reminders:AutoEmailEnabled` AND `Smtp:Host`/`FromEmail` are set; off by default).
  SMTP credentials belong in `appsettings.Development.json` / env vars (`Smtp__Password`), never
  in the checked-in `appsettings.json`.
- **Barcode**: labels via `jsbarcode` (CODE128 of barcode, else SKU) at `/products/labels`;
  scanning via USB scanner (Enter in product search = exact barcode/SKU add) or camera
  (`html5-qrcode`, lazy-loaded).
- **Customer portal** (`/portal`, `/portal/login`, `/api/portal/*`): customers sign in with mobile +
  password (`CustomerPortalAccounts`, bcrypt, 5 failures → 15 min lock). Portal JWTs are signed with
  a key DERIVED from the shared secret (`<secret>|portal`, `Auth/PortalTokenService.cs` +
  `src/lib/portal-jwt.ts`) and live in their own `portal_session` cookie, so a portal token can
  never act as a staff session or vice versa. Every portal query is scoped by the token's
  customerId; other customers' invoice ids return 404. Staff manage access from the key icon on
  Customers (`/api/customers/{id}/portal`, CUSTOMERS EDIT).
- **Software subscription** (`/settings/subscription`, `/api/subscription/*`, `Services/
  SubscriptionService.cs` + `RazorpayService.cs`): Razorpay **Orders** + Checkout, one order per
  billing period (this Razorpay account has no Subscriptions/Plans API — it returns 401). Paid-until
  and the current plan are DERIVED from PAID `SubscriptionPayments` periods, which
  `sp_SubscriptionPayment_MarkPaid` assigns contiguously under row locks (idempotent per order).
  Only one prepaid future period is allowed (renew = same plan, switch = other plan from the period
  end; no proration). Cancel: PERIOD_END (no refund, resumable) or IMMEDIATE (refunds unstarted
  periods + the current one if paid within `Subscription:RefundWindowDays`). Keys live in
  `dotnet user-secrets` (`Razorpay:KeyId/KeySecret/WebhookSecret`), never in appsettings. The webhook
  (`/api/subscription/webhook`, public in `middleware.ts`, HMAC-verified) is optional; "Check status"
  (`/orders/{id}/sync`) recovers payments locally. Gated by SETTINGS VIEW/EDIT.
- **Plans & limits** (`Services/PlanAccessService.cs`): plan rows carry `Tier` (TRIAL/BASIC/PRO),
  `InvoiceLimit` + `InvoiceLimitPeriod` (TOTAL/MONTH), `MaxUsers`, `LockedFeatures` (keys in
  `PlanFeatures`, mirrored in `src/lib/plan-store.ts`). Free trial = one-time ₹0 PAID period with no end
  date (`sp_Subscription_StartTrial`), 10 bills, all features; a paid plan replaces it immediately
  (purpose UPGRADE). Enforced on the backend: `SaleService` (bill limit → 402), `UsersController.Create`
  (user limit), `[RequirePlanFeature]` on CRM/HR/Manufacturing/GSTR/Portal/Recurring/Ask controllers.
  **No active plan = no new bills and premium modules locked** (reading data still works), so a fresh
  DB needs the trial started (landing "Free Trial" → `/dashboard?startTrial=1` → `TrialStarter`) before
  `scripts/e2e_flow_test.py` can create sales. Bills are counted by `Sales.CreatedAt` (demo data counts).
  UI: header `PlanBadge` (status light), `PlanGate` (locked-module screen), sidebar lock icons.
- **Getting started guide** (dashboard, `GettingStarted.tsx` ← `GET /api/onboarding` ←
  `sp_Onboarding_Status`): ordered setup steps ticked from real data (profile, plan, products, customer,
  invoice, payment, team), filtered to what the role can do; hidden when all done or dismissed.
- **Menu filter**: `filterNavGroups()` in `src/constants/nav.ts`, used by `Sidebar` and `MobileNav`.
- **`serverApiGet` on 403/402** redirects to `/no-access` / `/settings/subscription` instead of
  throwing (a cashier opening a supplier ledger by URL used to get a 500).
- **Ask your business** (`/reports/ask`, `/api/ask`, `Services/AskService.cs`): the language model
  (local Ollama, optional — `Ai:*` in appsettings) only *classifies* the question into a fixed
  intent + period phrase; it never sees the DB or writes SQL. Numbers always come from the existing
  read-only SPs. Without Ollama, a rule-based English/Hindi/Hinglish parser is used.
- **Dashboard insights**: `sp_Dashboard_Analytics` (period vs like-for-like previous period, top
  products/customers, receivable aging, categories, weekdays) → `BusinessInsights` component.
- **Auto backup**: `Services/BackupService.cs` (export logic shared with the manual download) +
  `AutoBackupWorker` (daily at `Backup:RunAtHour`, keeps `Backup:KeepCount`, folder
  `Backup:Directory`, default `backend/BillingErp.Api/backups/` — git-ignored). The export reads
  the big JSON output parameters **synchronously** on purpose: SqlClient's async path is
  pathologically slow for large NVARCHAR(MAX) values (minutes vs seconds).
- **Offline mode**: `public/sw.js` (network-first; caches visited pages, `/_next/static`, and
  `/api/products|customers|business`; never caches the portal; cleared on logout) +
  `src/lib/offlineQueue.ts` (IndexedDB). An invoice saved while offline is queued and POSTed to
  `/api/sales` on reconnect — numbering happens at sync time; server rejections (e.g. stock) land
  in Sales → Offline Invoices for retry/discard.
- **E2E check**: `python scripts/e2e_flow_test.py` (both servers running) walks the main business
  flows and asserts the numbers — it creates "Flow Test …" records, so dev/test DB only.
- **Python heredoc pitfall**: patching C# regexes through `python - <<EOF` turned `\b` into a
  literal backspace (0x08) once — if a regex "mysteriously" stops matching, `cat -A` the line.
- **Backup/Restore** (`/settings/backup`): generic, schema-driven — `sp_Backup_ExportTable`/
  `sp_Backup_ClearTable`/`sp_Backup_ImportTable` use dynamic SQL against a hardcoded table
  allowlist (never user input) plus `sys.columns` metadata to stay generic across all ~33 tables
  without one hand-written procedure per table. **Verified via a real export→restore round trip**
  in this session (data, password hashes, and identity seeds all survived correctly) — this is
  more thoroughly tested than the original version ever was.

## Data model

`backend/BillingErp.Api/Data/Entities/*.cs` + `AppDbContext.cs` define the schema (SQL Server,
via EF Core migrations under `Data/Migrations/`) — Auth/RBAC, Business settings, Catalog (Category/
Brand/Unit/Product), Customer/Supplier, Sales, Purchase, Payments, Inventory, Expenses, CRM (Lead),
HR (Employee/Attendance/Payroll), Manufacturing (BOMItem/ProductionOrder), plus AuditLog/
Notification — a 1:1 port of the original `prisma/schema.prisma` model shapes. Every FK defaults
to `DeleteBehavior.Restrict` (SQL Server rejects multiple cascade paths); only the specific parent/
child relations the original schema marked `onDelete: Cascade` are configured to cascade.

## What's full-depth vs. lighter-depth

Phases 1–9 of the original build (Dashboard, Products/Categories/Units, Customers/Suppliers +
ledgers, Sales incl. invoice PDF/print/returns, Purchase + returns, Inventory, Payments/Expenses,
all 6 Reports, Users/Roles/Settings, Excel Import) match the original spec's UI in reasonable
depth, and are now all backed by the .NET/SQL Server backend.

CRM, HR & Payroll, and Manufacturing are **functionally complete for one core workflow each**,
deliberately not fleshed out further:
- CRM: Leads list/detail + follow-up activity timeline + pipeline status. No email/calendar
  integration, no lead scoring.
- HR: Employees CRUD, daily Attendance marking, monthly Payroll generate/edit/mark-paid (flat
  clone of `Employee.Salary` into a DRAFT row — no attendance-based pro-rating). No leave balance
  tracking, no payslip PDF.
- Manufacturing: BOM setup (finished product → components + qty), Production Orders that consume
  component stock and produce finished-good stock on completion (verified: BOM quantity × order
  quantity math is correct). No multi-level BOM explosion, no partial/WIP production states beyond
  PLANNED → COMPLETED.

Other known gaps:
- **No image/file upload** — product images and expense attachments are plain URL text fields.
- **No automatic WhatsApp/Email sending** — the invoice/estimate screens open a pre-filled `wa.me` / `mailto:` link in the user's own app (free); server-side sending (SMTP / WhatsApp Business API) is not built.
- Behavioral quirks carried over faithfully from the original rather than "fixed" during the
  migration (see the git history / migration notes for the full list): sale cancel doesn't reverse
  payments or create a refund; sales/purchase returns don't touch the original invoice's paid/due
  amounts; profit/COGS calculations join against a product's *current* purchase price, not a
  historical snapshot at time of sale.
- Both `.NET` and SQL Server versions here are recent (.NET 10, SQL Server 2025) — verify behavior
  against installed versions rather than assuming from training data, same caution as the Next.js
  note above.

## Version surprises hit while building this

- **Prisma 7/8 vs. 6.19.3, npm ECONNRESET workarounds, etc.** — all specific to the archived
  Prisma-based version; no longer relevant now that the backend is .NET/SQL Server. See the
  archived version's history if resurrecting that codebase for reference.
- **`EXEC proc @Param = CASE WHEN ... END` is invalid T-SQL** — a `CASE` expression can't be used
  directly as a stored-procedure call's parameter value; compute it into a local `DECLARE`d
  variable first, then pass the variable (hit this in `sp_StockAdjustment_Create.sql`).
- **`JwtSecurityTokenHandler`'s default inbound claim-type map** silently remaps short claim names
  (e.g. `"email"`) to long legacy XML/WS-* URIs on `ValidateToken()` — clear
  `InboundClaimTypeMap = new Dictionary<string,string>()` on the handler instance to keep claim
  names exactly as issued (see `Auth/TokenService.cs`).
- `eslint-config-next` here bundles newer, stricter `eslint-plugin-react-hooks` rules (React
  Compiler-oriented). `react-hooks/set-state-in-effect` is downgraded to a warning in
  `eslint.config.mjs` (with a comment) because it flags the ordinary "fetch on mount" pattern used
  throughout this app (`useCrud`, every report page) — there's no data-fetching cache library
  (SWR/React Query) installed, so this is the deliberate, simple approach.

## Conventions

- **Modules** (used for permissions, nav, audit log): `DASHBOARD, SALES, PURCHASE, PRODUCTS,
  INVENTORY, CUSTOMERS, SUPPLIERS, CRM, HR, MANUFACTURING, EXPENSES, PAYMENTS, REPORTS, USERS,
  SETTINGS` — see `src/constants/permissions.ts` (also duplicated in `Data/DbSeeder.cs`, a plain
  C# port of the same `ROLE_GRANTS` table — keep both in sync if you add a module).
- **Permission actions**: `VIEW, CREATE, EDIT, DELETE, EXPORT, PRINT`.
- **StockTransaction types**: `PURCHASE, SALE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT, OPENING,
  PRODUCTION_IN, PRODUCTION_OUT`.
- **"Delete" on master data with history** (Product, Customer, Supplier, Employee) never
  hard-deletes if the record has related transactions — it flips `Status = 0` instead (see the
  `sp_<Entity>_Delete` procedures). Only genuinely unreferenced records get hard-deleted. Category/
  Unit deletes instead *block* with a 400 error when referenced (they don't have a status column to
  flip to) — this matches the original app's actual behavior, not the Product-style pattern.
- Backend controllers follow the reference pattern in `Controllers/ProductsController.cs` +
  `Data/StoredProcedures/sp_Product_*.sql` for simple CRUD, and `Controllers/SalesController.cs` +
  `sp_Sale_Create.sql` for transactional multi-table writes (JSON-array input via `OPENJSON`, a
  `WHILE`-loop-over-table-variable for per-row nested procedure calls — not SQL cursors).
- Shared UI building blocks live in `src/components/common/` (Button, Input, Select, Modal,
  ConfirmDialog, Toast, Badge, EmptyState, Skeleton) and `src/components/tables/DataTable.tsx`
  (search + sort + pagination + Excel/CSV/PDF export + print, used by nearly every list page).
- `src/lib/useCrud.ts` is the standard client-side data hook for simple CRUD list pages
  (`{items, loading, create, update, remove, refresh}`); most `/api/<entity>` + `/api/<entity>/[id]`
  endpoints on the backend exist specifically to back it.
- `src/lib/serverApi.ts`'s `serverApiGet()` is the standard way for a Server Component page to read
  data server-side (see `src/app/(app)/products/[id]/page.tsx`, the customer/supplier ledger
  pages, or `src/app/(app)/layout.tsx` for the pattern) — never import a database client directly
  from a Next.js file; there isn't one anymore.

  # Billing ERP — Project Guide (CLAUDE.md)

> This file is the single source of truth for building this project.
> Read it fully before writing any code. Follow the business logic in
> Section 5 **exactly** — it must not be changed or "simplified".

---

## 1. What we are building

A full **Billing ERP** (business management system) with:
Billing / Invoicing, Inventory, Accounting, Customers, Suppliers,
Purchase, Payments, Reports, Users & Roles, Settings — and stubs for
CRM, HR & Payroll, Manufacturing. Everything is **GST-ready (India)**.

Two separate programs that talk over HTTP:
- **Frontend (UI)** — what the user sees.
- **Backend + Database** — where data is saved and all rules run.

---

## 2. HARD CONSTRAINTS (read first)

1. **No paid APIs, no paid services, no subscriptions.** Use only free
   / open-source libraries and self-hostable tools. If a task seems to
   need a paid service, STOP and add a manual/free fallback instead,
   and leave a `// TODO: paid option` comment. Do not add a paid SDK.
2. **All business rules live in the backend**, never in the frontend.
   The UI only displays and collects input.
3. **Never store plaintext passwords.** Always hash with bcrypt.
4. **Do not invent GST rules, tax rates, or compliance thresholds.**
   Where a real-world rule/threshold is needed, use a value from a
   config file and add a `// VERIFY: official rule` comment. These
   rules change over time and must be confirmed by a human.
5. Keep secrets (JWT key, DB connection, SMTP) in environment
   variables / config, never hard-coded.

---

## 3. Tech stack (do not swap without asking)

**Frontend**
- TypeScript, React 19, Next.js 16 (App Router)
- Tailwind CSS
- Zustand (client state)
- Recharts (charts)

**Backend**
- C#, ASP.NET Core (.NET 10) Web API
- Dapper for queries; EF Core for migrations/schema

**Database**
- SQL Server (Express edition is free — fine for dev)
- T-SQL, Stored Procedures for the heavy business writes

**Security**
- JWT stored in an **HTTP-only cookie**
- bcrypt for password hashing
- Role-Based Access Control (RBAC)

All of the above have free editions/licenses. Keep it that way.

---

## 4. Architecture & request flow

```
Browser (Next.js)  ──/api/*──►  .NET Core API  ──Stored Proc──►  SQL Server
   UI only                    all business rules              data storage
```

Every request:
1. Backend checks the JWT token → who is this user + which role.
2. Backend checks RBAC → is this role allowed to do this action? If
   not, return **403 Forbidden** (do this in the backend, not by
   hiding buttons in the UI).
3. Backend applies the rule (GST / stock / due).
4. Backend reads/writes the DB (use a stored proc for multi-step
   writes so they are atomic).
5. Response goes back to the UI.

---

## 5. Core business logic (implement EXACTLY)

### 5.1 Auth
- Login: look up user by email → must be `active` → compare given
  password to stored bcrypt hash (hash-to-hash, never plaintext).
- On success, issue a JWT containing `userId` and `role`; set it as an
  **HTTP-only cookie**.
- Every protected endpoint validates the JWT and the role.

### 5.2 Invoice / document numbering
- Sale invoice number auto-increments: `INV-00001`, `INV-00002`, …
- Purchase number: `PUR-00001`, …
- The prefix (`INV`, `PUR`) comes from Settings and is configurable.
- Numbering must be gap-free and unique. Generate the number inside
  the same DB transaction that saves the document (never in the UI).

### 5.3 GST calculation (India)
- Decision rule:
  - **If customer state == business state → CGST + SGST**
    (split the tax rate in two halves).
  - **Else → IGST** (single combined rate).
- Tax rate per line comes from the product's tax rate (see HSN below).
- Do the calculation in the backend and store the computed tax on the
  saved invoice. `// VERIFY: current GST rules`

### 5.4 Stock ledger
- On **Sale** save → product quantity **decreases**.
- On **Purchase** save → product quantity **increases**.
- Both are ledger entries; the running stock is derived from the
  ledger. The stock update and the document save must happen in **one
  atomic transaction** — either both succeed or neither does.
- Admin can do a manual **inventory adjustment** (also a ledger entry).

### 5.5 Payments & dues
- `due = total_amount − amount_received_so_far`.
- "Receive Payment" (from customer) and "Pay Supplier" both add a
  payment record and reduce the due.
- When `due == 0`, mark the document **Paid**.
- Dashboard receivable/payable are computed by summing open dues, not
  stored separately.

### 5.6 Reports
- 6 report types: Sales, Purchase, GST, Profit, Payment, Expense.
- All are date-range filtered aggregations over existing transactions
  (e.g. `Profit = Sales − Purchase − Expense`).
- Export to Excel/PDF using free libraries only.

---

## 6. Modules & RBAC

15 modules, each with 6 actions: View, Create, Edit, Delete, Export,
Print. Enforce permissions in the backend.

**Admin / Full User** — everything: full CRUD on Sales, Purchase,
Products, Customers, Suppliers; Inventory adjustment; CRM, HR &
Payroll, Manufacturing; all Reports (view/print/export); Users & Roles;
Settings, Backup/Restore, Excel Import.

**Cashier** — limited, counter-focused:
- Can: view Dashboard; create + print Sale Invoice; view Products
  (no add); add Customer; receive Payment; view Reports.
- Cannot: Purchase, Inventory, CRM, HR, Manufacturing; any
  delete/cancel; Users, Roles, Settings.

Permission matrix (main modules):

| Module            | View | Create | Edit | Delete | Export | Print |
|-------------------|:----:|:------:|:----:|:------:|:------:|:-----:|
| **Admin** — Sales | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin — Purchase  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin — Inventory | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin — Users/Set.| ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Cashier** — Sales | ✓ | ✓ | – | – | – | ✓ |
| Cashier — Products  | ✓ | – | – | – | – | – |
| Cashier — Customers | ✓ | ✓ | – | – | – | – |
| Cashier — Payments  | ✓ | ✓ | – | – | – | – |
| Cashier — Reports   | ✓ | – | – | – | – | – |
| Cashier — Purch/Inv/Users | – | – | – | – | – | – |

Make the matrix data-driven (a `role_permissions` table), so roles can
be edited by an Admin without code changes.

---

## 7. Advanced features — build in PHASES

Build the core (Sections 5–6) first and get it working. Then add these
advanced features **in this order**. Every item here must stay free.

### Phase 1 — Quick wins (do these first)
- **Barcode / QR scan** — generate with `JsBarcode` / `bwip-js`; scan
  with `html5-qrcode` (camera) or a USB scanner (acts as keyboard).
- **UPI QR on invoice** — build a `upi://pay?pa=<VPA>&pn=<name>&am=<amt>`
  string and render it as a QR. Payment confirmation is **manual**
  (cashier marks Paid). `// TODO: paid gateway for auto-reconcile`
- **Send invoice via WhatsApp / Email** — WhatsApp via a
  `https://wa.me/<number>?text=<msg>` click link; Email via free SMTP
  (Gmail SMTP or the domain's SMTP).
- **Duplicate / template invoice** — one click to copy a past invoice.

### Phase 2 — Compliance + collection
- **Auto payment reminder** — scheduled job finds overdue dues and
  emails the customer (free). SMS/WhatsApp-bulk stay out (paid).
- **GSTR-1 / GSTR-3B export** — format existing data into the official
  JSON schema. `// VERIFY: current schema`
- **HSN + tax-rate auto-suggest** — a local lookup table built from the
  government's public HSN list; suggest HSN + rate per product.
- **Recurring invoices** — scheduled job creates fixed invoices.
- **Audit log** — a table recording who changed/deleted what and when.

### Phase 3 — Smart + reliable
- **Dashboard analytics** — trends, profit margin, top products
  (Recharts).
- **Customer portal** — customers log in to see their invoices/dues.
- **Offline mode + cloud backup** — IndexedDB + service worker for
  offline, sync on reconnect; backup via free storage quota
  (e.g. Google Drive free tier).
- **AI natural-language reports** — run a **local** model via `Ollama`
  (e.g. Llama/Mistral) so there is no per-call fee and data stays
  private. `// TODO: optional free API tier as alternative`

---

## 8. Coding conventions
- TypeScript strict mode on; no `any` unless justified.
- Backend: clear layering — Controller → Service (rules) → Repository
  (Dapper/SP). No business logic in controllers.
- Validate all input on the backend; never trust the client.
- Money: store as integer minor units or `decimal(18,2)` — never float.
- Return proper HTTP codes (401 not-logged-in, 403 no-permission,
  400 bad-input, 404 not-found).
- Keep functions small; name things in full words.

---

## 9. Suggested project structure
```
/frontend        Next.js app (UI only)
/backend         .NET Core Web API (all rules)
/database        SQL scripts, stored procs, EF migrations, seed
/docs            this file + specs
```

---

## 10. Build & run (fill in after scaffolding)
> Update these once the projects are scaffolded.
```
# frontend
cd frontend && npm install && npm run dev

# backend
cd backend && dotnet restore && dotnet run

# database
# apply EF migrations / run SQL scripts in /database
```

---

## 11. Definition of Done (QA checklist)
A feature is "done" only when:
- [ ] Backend enforces permissions (a wrong role gets **403**, tested
      by calling the API directly, not just hiding the UI button).
- [ ] Business math verified: GST split, invoice number gap-free,
      stock up/down, due = total − received.
- [ ] Atomic writes hold (kill mid-save → no half-saved data).
- [ ] Input validation + correct error codes.
- [ ] Works for both Admin and Cashier as per the matrix.
- [ ] No paid service crept in.

---

## 12. Seed data (dev only — change before production)
- Admin  → `admin@business.local` / `Admin@123`
- Cashier → `cashier@business.local` / `Cashier@123`
- A few sample products, one customer, one supplier.
Store these seed passwords already **bcrypt-hashed**, not plaintext.

---

## 13. What NOT to do
- Do not add any paid API, gateway, or subscription SDK.
- Do not put business rules (GST, stock, permissions) in the frontend.
- Do not store plaintext passwords or hard-code secrets.
- Do not invent tax rates / compliance thresholds — read from config
  and flag with `// VERIFY`.
- Do not change the tech stack or the numbering/GST/stock logic without
  asking first.

---

### How to work with me on this
When I give you a task, first tell me your plan and which files you'll
touch, then implement one feature at a time, then show me how to test
it. Keep changes small and reviewable.
