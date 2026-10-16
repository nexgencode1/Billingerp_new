"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, ChevronDown, LogOut, User as UserIcon, HelpCircle } from "lucide-react";
import { AlertsBell } from "@/components/layout/AlertsBell";
import { OfflineIndicator } from "@/components/offline/OfflineManager";
import { clearOfflineCaches } from "@/lib/offlineQueue";
import type { SessionPayload } from "@/types/auth";
import { useTourStore } from "@/lib/tour-store";
import { ProfileModal } from "@/components/layout/ProfileModal";
import { PlanBadge } from "@/components/subscription/PlanBadge";
import { usePlanStore } from "@/lib/plan-store";
import { cn } from "@/lib/utils";

export function Header({ session }: { session: SessionPayload }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const startTour = useTourStore((s) => s.start);
  const plan = usePlanStore((s) => s.plan);
  const planLight = !plan ? null : plan.status === "ACTIVE" || plan.status === "TRIAL" ? (plan.cancelAtPeriodEnd ? "bg-amber-500" : "bg-green-500") : "bg-red-500";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearOfflineCaches(); // cached pages/data belong to this user — don't leave them for the next one
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-chrome flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 md:px-6">
      <div data-tour="header-search" className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          placeholder="Search products, customers, invoices... (Ctrl+K)"
          className="h-9 w-full rounded-md border border-slate-300 bg-slate-50 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <OfflineIndicator />
        <AlertsBell />

        <button
          onClick={startTour}
          title="Take a Tour"
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
        >
          <HelpCircle className="h-5 w-5" />
        </button>

        <PlanBadge />

        <div data-tour="header-profile" className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
          >
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {session.name.charAt(0).toUpperCase()}
              {planLight && (
                <span
                  title={plan?.planName ? `${plan.planName} plan` : "No active plan"}
                  className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", planLight)}
                />
              )}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-slate-800 leading-tight">{session.name}</p>
              <p className="text-xs text-slate-500 leading-tight">{session.roleName}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-11 z-20 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-medium text-slate-800">{session.name}</p>
                <p className="text-xs text-slate-500">{session.email}</p>
                {plan && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                    <span className={cn("h-2 w-2 rounded-full", planLight)} />
                    {plan.planName ?? "No active plan"}
                    {plan.status === "ACTIVE" && !plan.cancelAtPeriodEnd && <span className="text-green-700">· Active</span>}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setProfileOpen(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                <UserIcon className="h-4 w-4" /> My Profile
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
