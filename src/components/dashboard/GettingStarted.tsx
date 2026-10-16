"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Compass, X } from "lucide-react";
import { useTourStore } from "@/lib/tour-store";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  key: string;
  done: boolean;
}

// Plain-language text for each setup step (status comes from GET /api/onboarding).
const STEP_TEXT: Record<string, { title: string; how: string; href: string; action: string }> = {
  business: {
    title: "Fill in your business profile",
    how: "Add your business name, address, phone, state and GSTIN. These print on every invoice and decide CGST+SGST vs IGST.",
    href: "/settings/business",
    action: "Open business profile",
  },
  plan: {
    title: "Start your free trial or pick a plan",
    how: "The free trial gives 10 bills with every feature. Choose Basic or Pro (monthly or yearly) any time.",
    href: "/settings/subscription",
    action: "See plans",
  },
  products: {
    title: "Add your products",
    how: "Add items with price, GST rate and opening stock — one by one, or import them all from Excel (Settings → Import).",
    href: "/products",
    action: "Add products",
  },
  customers: {
    title: "Add a customer",
    how: "Save the customer's name, mobile and state. Their state decides the GST type on the bill. Walk-in sales need no customer.",
    href: "/customers",
    action: "Add customer",
  },
  invoice: {
    title: "Create your first invoice",
    how: "Sales → New Invoice: pick the customer, scan or search products, enter the amount received and save. Stock reduces automatically.",
    href: "/sales/new",
    action: "Create invoice",
  },
  payment: {
    title: "Receive a payment",
    how: "When a customer pays a due bill later, record it in Payments. The invoice due goes down and becomes PAID at zero.",
    href: "/payments",
    action: "Receive payment",
  },
  team: {
    title: "Invite your team (optional)",
    how: "Add staff users with a role like Cashier — they only see what their role allows.",
    href: "/users",
    action: "Add users",
  },
};

const HIDE_KEY = "billing-getting-started-hidden";

// Dashboard checklist that walks a new business through setup in order. Hidden once every step is
// done, or when the user dismisses it (remembered per browser).
export function GettingStarted() {
  const startTour = useTourStore((s) => s.start);
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      // storage blocked — just show the guide
    }
    if (dismissed) return;
    fetch("/api/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { steps: OnboardingStep[] } | null) => {
        if (!data) return;
        setSteps(data.steps.filter((s) => STEP_TEXT[s.key]));
        setHidden(false);
      })
      .catch(() => {});
  }, []);

  if (hidden || !steps || steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const nextKey = steps.find((s) => !s.done)?.key;
  const pct = Math.round((doneCount / steps.length) * 100);

  function dismiss() {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  }

  return (
    <section className="rounded-lg border border-blue-200 bg-white" aria-labelledby="getting-started-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <h2 id="getting-started-title" className="text-sm font-semibold text-slate-900">
            Getting started — {doneCount} of {steps.length} steps done
          </h2>
          <div className="mt-1.5 h-1.5 w-48 max-w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={startTour} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-blue-700 hover:bg-blue-50">
            <Compass className="h-4 w-4" /> Guided tour
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand guide" : "Collapse guide"}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")} />
          </button>
          <button onClick={dismiss} aria-label="Hide guide" title="Hide guide" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <ol className="divide-y divide-slate-100">
          {steps.map((step, index) => {
            const text = STEP_TEXT[step.key];
            const isNext = step.key === nextKey;
            return (
              <li key={step.key} className={cn("flex items-start gap-3 px-5 py-3", isNext && "bg-blue-50/50")}>
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-label="Done" />
                ) : (
                  <Circle className={cn("mt-0.5 h-5 w-5 shrink-0", isNext ? "text-blue-500" : "text-slate-300")} aria-label="Not done" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", step.done ? "text-slate-400 line-through" : "text-slate-800")}>
                    Step {index + 1}: {text.title}
                  </p>
                  {!step.done && <p className="mt-0.5 text-sm text-slate-600">{text.how}</p>}
                </div>
                {!step.done && (
                  <Link
                    href={text.href}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium",
                      isNext ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {text.action}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
