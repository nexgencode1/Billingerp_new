"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { PLAN_FEATURE_LABELS, featureForPath, isFeatureLocked, usePlanStore } from "@/lib/plan-store";

// Replaces a page with an upgrade prompt when its module isn't in the current plan, instead of
// letting the page load and fail on 402s. The backend still enforces the lock.
export function PlanGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const plan = usePlanStore((s) => s.plan);
  const feature = featureForPath(pathname);

  if (!isFeatureLocked(plan, feature)) return <>{children}</>;

  const label = PLAN_FEATURE_LABELS[feature!] ?? feature;
  const message = plan!.active
    ? `${label} is not included in your ${plan!.planName} plan.`
    : plan!.status === "TRIAL_EXHAUSTED"
      ? `Your free trial is over. Choose a plan to keep using ${label}.`
      : `${label} needs an active plan.`;

  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <Lock className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Upgrade to unlock {label}</h1>
      <p className="text-sm text-slate-600">{message}</p>
      <Link
        href="/settings/subscription"
        className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        {plan!.trialAvailable ? "Start free trial" : "See plans"}
      </Link>
    </div>
  );
}
