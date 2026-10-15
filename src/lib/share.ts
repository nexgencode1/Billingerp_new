// Free, no-API sharing: WhatsApp click-to-chat links and mailto: links open the user's own
// WhatsApp / mail app with the message pre-filled — nothing is sent from our server.
// TODO: paid option — WhatsApp Business API / transactional email for fully automatic sending.

// Indian mobile numbers: keep digits, and prefix the 91 country code to a bare 10-digit number.
export function normalizeIndianMobile(mobile: string | null | undefined): string | null {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

export function whatsAppUrl(mobile: string | null | undefined, message: string): string {
  const phone = normalizeIndianMobile(mobile);
  const text = encodeURIComponent(message);
  // Without a number WhatsApp opens the contact picker so the user can choose who to send to.
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function mailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ShareableDocument {
  label: string; // "Invoice", "Estimate", ...
  number: string;
  date: string; // already formatted
  customerName: string | null;
  grandTotal: number;
  dueAmount?: number;
  businessName: string;
  upiId?: string | null;
  extraLine?: string;
}

export function shareMessage(d: ShareableDocument): string {
  const lines = [
    `Hello ${d.customerName ?? "there"},`,
    "",
    `${d.label} *${d.number}* dated ${d.date}`,
    `Amount: *${inr(d.grandTotal)}*`,
  ];
  if (d.dueAmount !== undefined && d.dueAmount > 0) lines.push(`Balance due: *${inr(d.dueAmount)}*`);
  if (d.extraLine) lines.push(d.extraLine);
  if (d.upiId && d.dueAmount !== undefined && d.dueAmount > 0) lines.push("", `Pay via UPI: ${d.upiId}`);
  lines.push("", `Thank you for your business!`, `— ${d.businessName}`);
  return lines.join("\n");
}

// UPI deep link (NPCI "upi://pay" format) — any UPI app can scan the QR made from it.
// Payment confirmation stays manual: the cashier records the receipt after checking their app.
// TODO: paid gateway for auto-reconcile.
export function upiPayUrl(vpa: string, payeeName: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa.trim(),
    pn: payeeName.slice(0, 50),
    am: amount.toFixed(2),
    cu: "INR",
    tn: note.slice(0, 80),
  });
  return `upi://pay?${params.toString()}`;
}
