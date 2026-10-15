"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function LoginForm() {
  useDocumentTitle("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      const next = searchParams.get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError("Unable to connect to server. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
          <Receipt className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Billing ERP</h1>
        <p className="text-xs text-slate-500">Billing &middot; Inventory &middot; Accounting &middot; CRM &middot; HR</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email / Username"
          type="text"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Remember me
          </label>
          <button type="button" className="text-blue-600 hover:underline">
            Forgot Password?
          </button>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Login
        </Button>
      </form>

      <div className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-xs">
        <p className="mb-2 font-semibold text-blue-800">Demo Login Credentials (click to fill)</p>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEmail("admin@business.local");
              setPassword("Admin@123");
            }}
            className="flex items-center justify-between rounded border border-blue-200 bg-white px-2.5 py-1.5 text-left hover:bg-blue-100"
          >
            <span className="font-medium text-slate-700">Admin</span>
            <span className="text-slate-500">admin@business.local / Admin@123</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail("cashier@business.local");
              setPassword("Cashier@123");
            }}
            className="flex items-center justify-between rounded border border-blue-200 bg-white px-2.5 py-1.5 text-left hover:bg-blue-100"
          >
            <span className="font-medium text-slate-700">Cashier</span>
            <span className="text-slate-500">cashier@business.local / Cashier@123</span>
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">v0.1.0</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
