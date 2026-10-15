"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LogIn } from "lucide-react";
import { Button, Input } from "@/components/common";

export default function PortalLoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed");
        return;
      }
      router.push("/portal");
      router.refresh();
    } catch {
      setError("Unable to connect. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-2 rounded-full bg-blue-100 p-3 text-blue-700">
            <FileText className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-slate-900">Customer Portal</h1>
          <p className="text-sm text-slate-500">See your bills, payments and balance — any time.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Input
            label="Mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="98XXXXXXXX"
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            <LogIn className="h-4 w-4" /> Sign in
          </Button>
          <p className="text-center text-xs text-slate-500">Don&apos;t have a password? Ask the shop to enable portal access for your number.</p>
        </div>
      </form>
    </main>
  );
}
