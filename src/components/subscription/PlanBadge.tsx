"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePlanStore } from "@/lib/plan-store";
import { cn } from "@/lib/utils";

// Header pill: current plan + a status light (green = active, amber = trial / ending, red = none).
export function PlanBadge() {
  const plan = usePlanStore((s) => s.plan);
  const refresh = usePlanStore((s) => s.refresh);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (!plan) return null;

  let label: string;
  let detail: string | null = null;
  let tone: "green" | "amber" | "red";
  if (plan.status === "ACTIVE") {
    label = plan.planName ?? "Active";
    detail = plan.cancelAtPeriodEnd ? "Ending" : "Active";
    tone = plan.cancelAtPeriodEnd ? "amber" : "green";
  } else if (plan.status === "TRIAL") {
    label = "Free Trial";
    detail = `${plan.invoicesLeft ?? 0} bills left`;
    tone = "green";
  } else if (plan.status === "TRIAL_EXHAUSTED") {
    label = "Trial over";
    detail = "Upgrade";
    tone = "red";
  } else {
    label = plan.trialAvailable ? "No plan" : plan.status === "EXPIRED" ? "Plan expired" : "No plan";
    detail = plan.trialAvailable ? "Start free trial" : "Choose plan";
    tone = "red";
  }

  return (
    <Link
      href="/settings/subscription"
      title="Subscription"
      className={cn(
        "hidden items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors md:inline-flex",
        tone === "green" && "border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
        tone === "red" && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        {tone === "green" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            tone === "green" && "bg-green-500",
            tone === "amber" && "bg-amber-500",
            tone === "red" && "bg-red-500"
          )}
        />
      </span>
      <span className="font-semibold">{label}</span>
      {detail && <span className="opacity-75">· {detail}</span>}
    </Link>
  );
}
