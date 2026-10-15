"use client";

import { Mail, MessageCircle } from "lucide-react";
import { mailtoUrl, shareMessage, whatsAppUrl, type ShareableDocument } from "@/lib/share";

// "Send on WhatsApp" / "Email" — open the user's own app with the message ready (free, no API).
export function ShareButtons({
  doc,
  mobile,
  email,
}: {
  doc: ShareableDocument;
  mobile: string | null | undefined;
  email: string | null | undefined;
}) {
  const message = shareMessage(doc);
  const linkClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50";

  return (
    <>
      <a href={whatsAppUrl(mobile, message)} target="_blank" rel="noopener noreferrer" className={linkClass} data-tour="share-whatsapp">
        <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp
      </a>
      <a href={mailtoUrl(email, `${doc.label} ${doc.number} from ${doc.businessName}`, message.replace(/\*/g, ""))} className={linkClass}>
        <Mail className="h-4 w-4 text-blue-600" /> Email
      </a>
    </>
  );
}
