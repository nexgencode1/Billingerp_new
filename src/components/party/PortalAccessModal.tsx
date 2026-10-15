"use client";

import { useEffect, useState } from "react";
import { KeyRound, MessageCircle, RefreshCw } from "lucide-react";
import { Button, Input, Modal } from "@/components/common";
import { Badge } from "@/components/common/Badge";
import { toast } from "@/lib/toast-store";
import { whatsAppUrl } from "@/lib/share";

interface PortalStatus {
  customerId: number;
  name: string;
  mobile: string;
  hasAccount: boolean;
  isEnabled: boolean;
  lastLoginAt: string | null;
  locked: boolean;
}

// No ambiguous characters (0/O, 1/l/I) so it can be read out over the phone.
function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// Staff-side: turn a customer's portal access on/off, set a password and share the login details.
export function PortalAccessModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState<string | null>(null); // password just set (shown once, for sharing)

  useEffect(() => {
    fetch(`/api/customers/${customerId}/portal`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => toast.error("Could not load portal status."));
  }, [customerId]);

  async function save(enabled: boolean) {
    if (enabled && !status?.hasAccount && password.trim().length < 6) {
      toast.error("Set a password of at least 6 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/portal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, password: password.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not save.");
        return;
      }
      setStatus(data);
      if (password.trim()) setShared(password.trim());
      setPassword("");
      toast.success(enabled ? "Portal access saved." : "Portal access turned off.");
    } finally {
      setSaving(false);
    }
  }

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/login` : "/portal/login";
  const message = status
    ? `Hello ${status.name}, you can now see your bills, payments and balance online:\n${portalUrl}\nMobile: ${status.mobile}${shared ? `\nPassword: ${shared}` : ""}`
    : "";

  return (
    <Modal open onClose={onClose} title="Customer Portal Access" size="md">
      {!status ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-md bg-slate-50 p-3 text-sm">
            <span>
              <span className="font-semibold text-slate-800">{status.name}</span>
              <span className="block text-xs text-slate-500">Signs in with mobile {status.mobile}</span>
            </span>
            {status.locked ? (
              <Badge tone="red">Locked (too many wrong tries)</Badge>
            ) : status.hasAccount && status.isEnabled ? (
              <Badge tone="green">Enabled</Badge>
            ) : (
              <Badge tone="slate">Off</Badge>
            )}
          </div>
          {status.lastLoginAt && <p className="text-xs text-slate-500">Last sign-in: {new Date(status.lastLoginAt).toLocaleString("en-IN")}</p>}

          <div className="flex items-end gap-2">
            <div className="flex-1">
            <Input
              label={status.hasAccount ? "New password (optional — also unlocks)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
            </div>
            <Button variant="outline" onClick={() => setPassword(generatePassword())} title="Generate a password">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {status.hasAccount && status.isEnabled && (
              <Button variant="outline" loading={saving} onClick={() => save(false)}>
                Turn off
              </Button>
            )}
            <Button loading={saving} onClick={() => save(true)}>
              <KeyRound className="h-4 w-4" /> {status.hasAccount && status.isEnabled ? "Save" : "Enable portal"}
            </Button>
          </div>

          {status.hasAccount && status.isEnabled && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
              <p className="mb-2 text-green-800">
                Share the login with the customer{shared ? " (includes the new password — it won't be shown again)" : ""}:
              </p>
              <a
                href={whatsAppUrl(status.mobile, message)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <MessageCircle className="h-4 w-4 text-green-600" /> Send on WhatsApp
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
