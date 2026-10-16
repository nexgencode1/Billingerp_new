import { create } from "zustand";

// The business's current plan as reported by GET /api/subscription/status. Used for the header
// badge, nav lock icons and the locked-module screen — UX only; the backend enforces every limit
// ([RequirePlanFeature] / bill + user limits return 402).
export interface PlanEntitlement {
  status: "ACTIVE" | "TRIAL" | "TRIAL_EXHAUSTED" | "NONE" | "PENDING" | "EXPIRED" | "ENDED" | "CANCELLED";
  active: boolean;
  planId: number | null;
  planName: string | null;
  tier: "TRIAL" | "BASIC" | "PRO" | null;
  paidUntil: string | null;
  cancelAtPeriodEnd: boolean;
  invoiceLimit: number | null;
  invoiceLimitPeriod: "TOTAL" | "MONTH" | null;
  invoicesUsed: number;
  invoicesLeft: number | null;
  maxUsers: number | null;
  activeUsers: number;
  lockedFeatures: string[];
  trialAvailable: boolean;
}

// Mirrors PlanFeatures in backend Services/PlanAccessService.cs.
export const PLAN_FEATURE_LABELS: Record<string, string> = {
  CRM: "CRM",
  HR: "HR & Payroll",
  MANUFACTURING: "Manufacturing",
  GST_RETURNS: "GSTR-1 / GSTR-3B export",
  PORTAL: "Customer portal",
  RECURRING: "Recurring invoices",
  AI_REPORTS: "Ask your business (AI reports)",
};

const ROUTE_FEATURES: [prefix: string, feature: string][] = [
  ["/crm", "CRM"],
  ["/hr", "HR"],
  ["/manufacturing", "MANUFACTURING"],
  ["/reports/gstr", "GST_RETURNS"],
  ["/reports/ask", "AI_REPORTS"],
  ["/sales/recurring", "RECURRING"],
];

export function featureForPath(pathname: string): string | null {
  const match = ROUTE_FEATURES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}

interface PlanState {
  plan: PlanEntitlement | null;
  refresh: () => Promise<void>;
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: null,
  refresh: async () => {
    try {
      const res = await fetch("/api/subscription/status", { cache: "no-store" });
      if (res.ok) set({ plan: await res.json() });
    } catch {
      // offline — keep the last known plan
    }
  },
}));

export function isFeatureLocked(plan: PlanEntitlement | null, feature: string | null): boolean {
  return !!plan && !!feature && plan.lockedFeatures.includes(feature);
}
