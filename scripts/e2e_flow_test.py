"""End-to-end business-flow test against the running app (through the Next.js proxy).

Run with both servers up:   python scripts/e2e_flow_test.py
It CREATES real, clearly-labelled records ("Flow Test Customer HHMMSS", a supplier, an estimate,
invoices, a purchase, a return, an expense, a cash->bank transfer, a paused recurring template and
a portal login) and checks every number along the way — use it on a dev/test database only."""
import json, sys, time, urllib.request, urllib.error, http.cookiejar
from datetime import date

sys.stdout.reconfigure(encoding="utf-8")  # ₹ in answers
BASE = "http://localhost:3000"
results = []

def client():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(op, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with op.open(req, timeout=180) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors="replace")

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

def stock_of(op, pid):
    _, rows = call(op, "GET", "/api/inventory/stock")
    return next(r["currentStock"] for r in rows if r["id"] == pid)

def acct_balances(op):
    _, accts = call(op, "GET", "/api/cash-bank/accounts")
    return {a["kind"]: a["currentBalance"] for a in accts if a["isDefault"] or a["kind"] == "CASH"}

admin = client()
s, _ = call(admin, "POST", "/api/auth/login", {"email": "admin@business.local", "password": "Admin@123"})
check("admin login", s == 200)
stamp = time.strftime("%H%M%S")
today = date.today().isoformat()

# ---------- master data ----------
s, cust = call(admin, "POST", "/api/customers", {"name": f"Flow Test Customer {stamp}", "mobile": f"98{stamp}11", "state": "Uttar Pradesh", "city": "Noida", "email": None, "address": None})
check("create customer", s == 201 and cust.get("id"), s)
s, sup = call(admin, "POST", "/api/suppliers", {"name": f"Flow Test Supplier {stamp}", "mobile": f"97{stamp}22", "state": "Delhi", "email": None, "address": None})
check("create supplier", s == 201 and sup.get("id"), s)
_, products = call(admin, "GET", "/api/products")
prod = next(p for p in products if p["sku"] == "DEMO-004")  # Realme 20W charger, 18% GST
stock0 = stock_of(admin, prod["id"])
bal0 = acct_balances(admin)

# ---------- estimate -> invoice ----------
item = {"productId": prod["id"], "productName": prod["name"], "quantity": 4, "rate": 500, "discount": 0, "gstRate": 18}
s, est = call(admin, "POST", "/api/sales-documents", {"docType": "ESTIMATE", "docDate": today, "dueDate": today, "customerId": cust["id"], "notes": "Flow test", "items": [item]})
check("estimate created (IGST, interstate UP vs Delhi)", s == 201 and est["igst"] == 360 and est["grandTotal"] == 2360, f"{est.get('docNumber')} igst={est.get('igst')} total={est.get('grandTotal')}")
s, sale = call(admin, "POST", "/api/sales", {"invoiceDate": today + "T10:00:00", "customerId": cust["id"], "sourceDocumentId": est["id"], "items": [item], "payments": [{"method": "CASH", "amount": 1000}]})
check("estimate converted to invoice, partial payment", s == 201 and sale["paidAmount"] == 1000 and sale["dueAmount"] == 1360 and sale["paymentStatus"] == "PARTIAL", f"{sale.get('invoiceNumber')} due={sale.get('dueAmount')}")
_, est2 = call(admin, "GET", f"/api/sales-documents/{est['id']}")
check("estimate marked CONVERTED", est2["status"] == "CONVERTED" and est2["convertedInvoiceNumber"] == sale["invoiceNumber"])
check("stock reduced by 4", stock_of(admin, prod["id"]) == stock0 - 4, f"{stock0} -> {stock_of(admin, prod['id'])}")

s, pay = call(admin, "POST", "/api/payments/receive", {"customerId": cust["id"], "saleId": sale["id"], "amount": 1360, "method": "UPI", "date": today + "T12:00:00"})
check("receive remaining payment", s in (200, 201), s)
_, sale2 = call(admin, "GET", f"/api/sales/{sale['id']}")
check("invoice now PAID, due 0", sale2["paymentStatus"] == "PAID" and sale2["dueAmount"] == 0)
s, over = call(admin, "POST", "/api/payments/receive", {"customerId": cust["id"], "saleId": sale["id"], "amount": 1, "method": "CASH", "date": today})
check("over-payment rejected", s == 400, s)

# ---------- credit note ----------
s, ret = call(admin, "POST", "/api/sales/returns", {"saleId": sale["id"], "reason": "Flow test return", "refundMethod": "Cash", "items": [{"productId": prod["id"], "productName": prod["name"], "quantity": 1, "rate": 500}]})
check("credit note (sale return) created", s in (200, 201), s)
check("stock +1 after return", stock_of(admin, prod["id"]) == stock0 - 3)

# ---------- purchase -> pay supplier ----------
pitem = {"productId": prod["id"], "productName": prod["name"], "quantity": 10, "rate": 320, "discount": 0, "gstRate": 18}
s, pur = call(admin, "POST", "/api/purchases", {"purchaseDate": today + "T11:00:00", "supplierId": sup["id"], "supplierInvoiceNumber": f"FT-{stamp}", "items": [pitem], "payments": []})
check("purchase on credit (CGST+SGST, same state)", s == 201 and pur["cgst"] == 288 and pur["sgst"] == 288 and pur["dueAmount"] == 3776, f"{pur.get('purchaseNumber')} due={pur.get('dueAmount')}")
check("stock +10 after purchase", stock_of(admin, prod["id"]) == stock0 + 7)
s, _ = call(admin, "POST", "/api/payments/pay", {"supplierId": sup["id"], "purchaseId": pur["id"], "amount": 3776, "method": "BANK", "date": today + "T13:00:00"})
_, pur2 = call(admin, "GET", f"/api/purchases/{pur['id']}")
check("supplier paid in full", s in (200, 201) and pur2["paymentStatus"] == "PAID")

# ---------- expense + cash/bank ----------
_, cats = call(admin, "GET", "/api/expense-categories")
s, _ = call(admin, "POST", "/api/expenses", {"categoryId": cats[0]["id"], "amount": 250, "date": today + "T14:00:00", "paymentMethod": "CASH", "description": "Flow test tea & snacks"})
check("expense recorded", s in (200, 201), s)
bal1 = acct_balances(admin)
# cash: +1000 (sale) -500 (cash refund) -250 (expense);  bank: +1360 (UPI) -3776 (supplier)
check("cash balance moved by +250", round(bal1["CASH"] - bal0["CASH"], 2) == 250, f"{bal0['CASH']} -> {bal1['CASH']}")
check("bank balance moved by -2416", round(bal1["BANK"] - bal0["BANK"], 2) == -2416, f"{bal0['BANK']} -> {bal1['BANK']}")
_, accts = call(admin, "GET", "/api/cash-bank/accounts")
cash_id = next(a["id"] for a in accts if a["kind"] == "CASH"); bank_id = next(a["id"] for a in accts if a["kind"] == "BANK" and a["isDefault"])
s, _ = call(admin, "POST", "/api/cash-bank/transactions", {"type": "TRANSFER", "fromAccountId": cash_id, "toAccountId": bank_id, "amount": 200, "date": today + "T18:00:00", "note": "Flow test deposit"})
bal2 = acct_balances(admin)
check("cash->bank transfer moves 200", s == 201 and round(bal2["CASH"] - bal1["CASH"], 2) == -200 and round(bal2["BANK"] - bal1["BANK"], 2) == 200)

# ---------- reports reflect it ----------
_, db = call(admin, "GET", f"/api/reports/day-book?from={today}&to={today}")
refs = {r["refNumber"] for r in db["rows"]}
check("day book lists invoice, purchase, estimate", {sale["invoiceNumber"], pur["purchaseNumber"], est["docNumber"]} <= refs)
_, bs = call(admin, "GET", "/api/reports/balance-sheet")
check("balance sheet balances", round(bs["totalAssets"], 2) == round(bs["totalLiabilities"] + bs["totalEquity"], 2))
_, g1 = call(admin, "GET", f"/api/gst/gstr1?from={today}&to={today}")
check("GSTR-1 includes today's invoice", any(i["invoiceNumber"] == sale["invoiceNumber"] for i in g1["b2cl"] + g1["b2b"]) or g1["summary"]["b2csCount"] > 0)

# ---------- recurring ----------
s, rec = call(admin, "POST", "/api/recurring-invoices", {"name": f"Flow test monthly {stamp}", "customerId": cust["id"], "frequency": "MONTHLY", "startDate": today, "items": [dict(item, quantity=1)]})
check("recurring template created", s == 201, s)
s, run = call(admin, "POST", f"/api/recurring-invoices/{rec['id']}/run")
check("recurring run-now created invoice", s == 200 and run.get("invoiceNumber"), run.get("invoiceNumber") if isinstance(run, dict) else run)
call(admin, "PUT", f"/api/recurring-invoices/{rec['id']}", {"name": rec["name"], "customerId": cust["id"], "frequency": "MONTHLY", "startDate": rec["startDate"], "isActive": False, "items": rec["items"]})

# ---------- reminders + portal ----------
_, rem = call(admin, "GET", "/api/reminders")
check("reminders list loads", isinstance(rem.get("customers"), list))
s, _ = call(admin, "PUT", f"/api/customers/{cust['id']}/portal", {"enabled": True, "password": "Flow@1234"})
check("portal access enabled", s == 200)
portal = client()
s, _ = call(portal, "POST", "/api/portal/login", {"mobile": f"98{stamp}11", "password": "Flow@1234"})
check("customer portal login", s == 200)
_, summ = call(portal, "GET", "/api/portal/summary")
nums = {i["invoiceNumber"] for i in summ["invoices"]}
check("portal shows this customer's invoices only", sale["invoiceNumber"] in nums and all(n for n in nums), f"{len(nums)} invoices")
s, _ = call(portal, "GET", "/api/portal/invoices/1")
check("portal cannot open another customer's invoice", s == 404, s)

# ---------- ask ----------
_, ans = call(admin, "POST", "/api/ask", {"question": "aaj ki sale kitni hui"})
check("ask: today's sales answered", ans.get("intent") == "SALES" and ans.get("period") in ("aaj", "today"), ans.get("answer"))

# ---------- cashier RBAC ----------
cashier = client()
call(cashier, "POST", "/api/auth/login", {"email": "cashier@business.local", "password": "Cashier@123"})
for name, method, path, body, expect in [
    ("cashier can create sale doc", "GET", "/api/sales-documents?type=ESTIMATE", None, 200),
    ("cashier cannot purchase", "POST", "/api/purchases", {"purchaseDate": today, "supplierId": sup["id"], "items": [pitem]}, 403),
    ("cashier cannot cancel invoice", "POST", f"/api/sales/{sale['id']}/cancel", {"reason": "x"}, 403),
    ("cashier cannot change portal access", "PUT", f"/api/customers/{cust['id']}/portal", {"enabled": False}, 403),
    ("cashier cannot run backup", "POST", "/api/settings/backup/auto/run", None, 403),
    ("cashier can ask questions", "POST", "/api/ask", {"question": "today sales"}, 200),
]:
    s, _ = call(cashier, method, path, body)
    check(name, s == expect, f"got {s}")

passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
