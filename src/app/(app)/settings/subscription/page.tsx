"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2, CreditCard, RefreshCw, AlertTriangle, CalendarClock, XCircle, RotateCcw, Gift, Minus, Sparkles,
} from "lucide-react";
import { Badge, Button, Modal, Skeleton } from "@/components/common";
import { toast } from "@/lib/toast-store";
import { useCan } from "@/lib/permissions-context";
import { usePlanStore, type PlanEntitlement } from "@/lib/plan-store";
import { cn, formatCurrency } from "@/lib/utils";

type DisplayStatus = "NONE" | "PENDING" | "ACTIVE" | "CANCELS_AT_PERIOD_END" | "EXPIRED" | "ENDED" | "CANCELLED";
type Billing = "monthly" | "yearly";

interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  periodMonths: number;
  tier: "TRIAL" | "BASIC" | "PRO";
  invoiceLimit: number | null;
  invoiceLimitPeriod: "TOTAL" | "MONTH" | null;
  maxUsers: number | null;
  features: { text: string; included: boolean }[];
}

interface SubscriptionPayment {
  id: number;
  planName: string;
  purpose: string;
  status: "CREATED" | "PAID" | "FAILED" | "REFUNDED";
  amount: number;
  currency: string;
  orderId: string;
  paymentId: string | null;
  method: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  error: string | null;
  refundAmount: number | null;
  refundStatus: string | null;
  createdAt: string;
  paidAt: string | null;
  canSync: boolean;
  canRetryRefund: boolean;
}

interface SubscriptionData {
  gateway: { configured: boolean; testMode: boolean; webhookConfigured: boolean };
  policy: { refundWindowDays: number; renewReminderDays: number };
  plans: Plan[];
  entitlement: PlanEntitlement;
  current: {
    status: DisplayStatus;
    hasAccess: boolean;
    onTrial: boolean;
    trialAvailable: boolean;
    plan: { id: number; name: string } | null;
    periodStart: string | null;
    periodEnd: string | null;
    paidUntil: string | null;
    daysLeft: number;
    renewDue: boolean;
    upcoming: { planId: number; planName: string; periodStart: string; periodEnd: string } | null;
    cancelReason: string | null;
    cancelledAt: string | null;
    refundPreview: { amount: number; lines: { paymentId: number; amount: number; reason: string }[] };
  };
  payments: SubscriptionPayment[];
}

interface CheckoutOrder {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
  purpose: string;
  businessName: string;
  prefill: { name: string; email: string };
}

// Minimal typing for Razorpay's checkout.js (loaded on demand from Razorpay's CDN).
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayFailure {
  error: { description?: string; metadata?: { order_id?: string; payment_id?: string } };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailure) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

function loadCheckoutScript(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      const loaded = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
      if (loaded) resolve(loaded);
      else reject(new Error("Razorpay did not load"));
    };
    script.onerror = () => reject(new Error("Could not load Razorpay checkout. Check your internet connection."));
    document.body.appendChild(script);
  });
}

const STATUS_LABEL: Record<DisplayStatus, { label: string; tone: "green" | "yellow" | "red" | "blue" | "slate" }> = {
  NONE: { label: "No subscription", tone: "slate" },
  PENDING: { label: "Payment pending", tone: "yellow" },
  ACTIVE: { label: "Active", tone: "green" },
  CANCELS_AT_PERIOD_END: { label: "Cancels at period end", tone: "yellow" },
  EXPIRED: { label: "Expired", tone: "red" },
  ENDED: { label: "Ended", tone: "slate" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

const PAYMENT_TONE: Record<SubscriptionPayment["status"], "green" | "yellow" | "red" | "blue"> = {
  PAID: "green",
  CREATED: "yellow",
  FAILED: "red",
  REFUNDED: "blue",
};

const PURPOSE_LABEL: Record<string, string> = {
  NEW: "New",
  RENEWAL: "Renewal",
  CHANGE: "Plan change",
  UPGRADE: "Upgrade from trial",
  TRIAL: "Free trial",
};

function formatDay(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function periodLabel(months: number) {
  if (months === 1) return "month";
  if (months === 12) return "year";
  return `${months} months`;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = Math.min(100, limit > 0 ? (used / limit) * 100 : 100);
  return (
    <div className="mt-2 max-w-sm">
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-medium text-slate-800">
          {Math.min(used, limit)} / {limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={cn("h-2 rounded-full", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  useDocumentTitle("Subscription");
  const canEdit = useCan("SETTINGS", "EDIT");
  const refreshPlan = usePlanStore((s) => s.refresh);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [selectedTier, setSelectedTier] = useState<Plan["tier"] | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [busyPaymentId, setBusyPaymentId] = useState<number | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMode, setCancelMode] = useState<"PERIOD_END" | "IMMEDIATE">("PERIOD_END");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "Could not load subscription.");
        return;
      }
      setData(json);
      setLoadError(null);
    } catch {
      setLoadError("Could not load subscription.");
    }
    refreshPlan();
  }, [refreshPlan]);

  useEffect(() => {
    load();
  }, [load]);

  async function syncOrder(orderId: string, quiet = false) {
    const { ok, data: result } = await postJson(`/api/subscription/orders/${encodeURIComponent(orderId)}/sync`);
    if (!ok) {
      if (!quiet) toast.error(result.error ?? "Could not check payment status.");
    } else if (result.success) {
      toast.success("Payment received — subscription updated.");
    } else if (!quiet) {
      toast.info("No completed payment found for this order yet.");
    }
    await load();
  }

  async function startTrial(plan: Plan) {
    if (busyPlanId !== null) return;
    setBusyPlanId(plan.id);
    const { ok, data: result } = await postJson("/api/subscription/trial");
    setBusyPlanId(null);
    if (ok) toast.success("Free trial started — 10 bills free with every feature.");
    else toast.error(result.error ?? "Could not start the free trial.");
    await load();
  }

  async function startCheckout(plan: Plan) {
    if (busyPlanId !== null) return; // one checkout at a time; other cards stay untouched
    setBusyPlanId(plan.id);
    try {
      const { ok, data: order } = await postJson("/api/subscription/checkout", { planId: plan.id });
      if (!ok) {
        toast.error(order.error ?? "Could not start payment.");
        setBusyPlanId(null);
        return;
      }
      const checkout = order as CheckoutOrder;
      const Razorpay = await loadCheckoutScript();
      let settled = false;

      const instance = new Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: checkout.businessName,
        description: `${checkout.planName} plan (${periodLabel(plan.periodMonths)}ly)`,
        prefill: { name: checkout.prefill.name, email: checkout.prefill.email },
        notes: { plan: plan.code },
        theme: { color: "#2563eb" },
        handler: async (response: RazorpaySuccess) => {
          settled = true;
          const { ok: confirmed, data: result } = await postJson("/api/subscription/confirm", {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          if (confirmed) toast.success(`Payment successful — ${checkout.planName} plan is active.`);
          else toast.error(result.error ?? "Payment could not be verified. Use “Check status” in the history below.");
          setBusyPlanId(null);
          await load();
        },
        modal: {
          // Closed without the success callback: the payment may still have gone through (e.g. UPI
          // approved on the phone after closing), so ask the server once.
          ondismiss: async () => {
            setBusyPlanId(null);
            if (!settled) await syncOrder(checkout.orderId, true);
          },
        },
      });
      instance.on("payment.failed", (response: RazorpayFailure) => {
        postJson("/api/subscription/failed", {
          razorpayOrderId: response.error.metadata?.order_id ?? checkout.orderId,
          razorpayPaymentId: response.error.metadata?.payment_id ?? null,
          description: response.error.description ?? "Payment failed",
        });
        toast.error(response.error.description ?? "Payment failed. You can try again.");
      });
      instance.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payment.");
      setBusyPlanId(null);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    const { ok, data: result } = await postJson("/api/subscription/cancel", { mode: cancelMode, reason: cancelReason || null });
    setCancelling(false);
    if (!ok) {
      toast.error(result.error ?? "Could not cancel the subscription.");
      return;
    }
    if (cancelMode === "PERIOD_END") {
      toast.success("Subscription will end on the paid-until date.");
    } else {
      const failed = (result.refunds ?? []).filter((r: { success: boolean }) => !r.success).length;
      if (failed > 0) toast.error(`Subscription cancelled, but ${failed} refund(s) failed — retry from the payment history.`);
      else if (result.refundedAmount > 0) toast.success(`Subscription cancelled. ${formatCurrency(result.refundedAmount)} refund initiated.`);
      else toast.success("Subscription cancelled.");
    }
    setCancelOpen(false);
    setCancelReason("");
    await load();
  }

  async function handleResume() {
    setResuming(true);
    const { ok, data: result } = await postJson("/api/subscription/resume");
    setResuming(false);
    if (!ok) toast.error(result.error ?? "Could not resume the subscription.");
    else toast.success("Cancellation withdrawn — your subscription continues.");
    await load();
  }

  async function retryRefund(payment: SubscriptionPayment) {
    setBusyPaymentId(payment.id);
    const { ok, data: result } = await postJson(`/api/subscription/payments/${payment.id}/refund`);
    setBusyPaymentId(null);
    if (!ok) toast.error(result.error ?? "Refund failed.");
    else toast.success(`${formatCurrency(payment.amount)} refund initiated.`);
    await load();
  }

  async function checkStatus(payment: SubscriptionPayment) {
    setBusyPaymentId(payment.id);
    await syncOrder(payment.orderId);
    setBusyPaymentId(null);
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-900">Subscription</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-900">Subscription</h1>
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const { current, plans, payments, gateway, policy, entitlement } = data;
  const status = STATUS_LABEL[current.status];
  const prepaidAlready = current.upcoming !== null;
  const currentPlan = plans.find((p) => p.id === current.plan?.id) ?? null;
  // Default the toggle to the billing cycle of the plan the business is on.
  const activeBilling: Billing = billing ?? (currentPlan?.periodMonths === 12 ? "yearly" : "monthly");
  const months = activeBilling === "yearly" ? 12 : 1;
  const trialPlan = plans.find((p) => p.tier === "TRIAL") ?? null;
  const paidPlans = plans.filter((p) => p.tier !== "TRIAL" && p.periodMonths === months);
  const visiblePlans = [...(trialPlan ? [trialPlan] : []), ...paidPlans];
  const yearlySaving = (() => {
    const monthly = plans.find((p) => p.tier === "PRO" && p.periodMonths === 1);
    const yearly = plans.find((p) => p.tier === "PRO" && p.periodMonths === 12);
    return monthly && yearly ? Math.round(monthly.price * 12 - yearly.price) : 0;
  })();

  function planAction(plan: Plan): { label: string; disabled: boolean; hint?: string; onClick?: () => void } {
    if (plan.tier === "TRIAL") {
      if (current.onTrial) return { label: "Current plan", disabled: true };
      if (current.trialAvailable) return { label: "Start free trial", disabled: false, onClick: () => startTrial(plan), hint: "No payment needed" };
      return { label: current.hasAccess ? "Included in your plan" : "Trial already used", disabled: true };
    }
    const pay = () => startCheckout(plan);
    if (!gateway.configured) return { label: "Payments not configured", disabled: true };
    if (!current.hasAccess) return { label: "Subscribe", disabled: false, onClick: pay };
    if (current.onTrial) return { label: "Upgrade now", disabled: false, onClick: pay, hint: "Starts today and replaces the trial" };
    if (prepaidAlready) return { label: "Already renewed", disabled: true };
    if (current.plan?.id === plan.id) return { label: "Renew now", disabled: false, onClick: pay, hint: `Adds 1 ${periodLabel(plan.periodMonths)} after ${formatDay(current.paidUntil)}` };
    return { label: "Switch to this plan", disabled: false, onClick: pay, hint: `Starts after your current period ends (${formatDay(current.paidUntil)})` };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">Subscription</h1>
        {gateway.testMode && <Badge tone="yellow">Razorpay test mode — no real money is charged</Badge>}
      </div>

      {!gateway.configured && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Online payment is not configured. Set Razorpay:KeyId and Razorpay:KeySecret on the backend.
        </div>
      )}

      {/* Current subscription */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Current plan</h2>
              {current.onTrial ? (
                <Badge tone={entitlement.status === "TRIAL_EXHAUSTED" ? "red" : "green"}>
                  {entitlement.status === "TRIAL_EXHAUSTED" ? "Trial used up" : "Free trial"}
                </Badge>
              ) : (
                <Badge tone={status.tone}>{status.label}</Badge>
              )}
            </div>

            {current.onTrial ? (
              <>
                <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Gift className="h-5 w-5 text-green-600" /> Free Trial
                </p>
                <p className="text-sm text-slate-600">
                  {entitlement.status === "TRIAL_EXHAUSTED"
                    ? "All trial bills are used. Choose Basic or Pro below to keep billing."
                    : "Every feature is unlocked. Upgrade any time — the paid plan starts right away."}
                </p>
                <UsageBar used={entitlement.invoicesUsed} limit={entitlement.invoiceLimit ?? 0} label="Trial bills used" />
              </>
            ) : current.hasAccess && current.plan ? (
              <>
                <p className="text-lg font-semibold text-slate-900">
                  {current.plan.name}
                  {currentPlan && <span className="ml-2 text-sm font-normal text-slate-500">({periodLabel(currentPlan.periodMonths)}ly)</span>}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                  <CalendarClock className="h-4 w-4" />
                  {current.status === "CANCELS_AT_PERIOD_END" ? "Access ends on " : "Paid until "}
                  <span className="font-medium text-slate-800">{formatDay(current.paidUntil)}</span>
                  <span className="text-slate-400">({current.daysLeft} day{current.daysLeft === 1 ? "" : "s"} left)</span>
                </p>
                {current.upcoming && (
                  <p className="text-sm text-slate-600">
                    Next period: <span className="font-medium">{current.upcoming.planName}</span> from {formatDay(current.upcoming.periodStart)} to{" "}
                    {formatDay(current.upcoming.periodEnd)}
                  </p>
                )}
                {current.status === "CANCELS_AT_PERIOD_END" && current.cancelReason && (
                  <p className="text-sm text-slate-500">Reason: {current.cancelReason}</p>
                )}
                {entitlement.invoiceLimit !== null && (
                  <UsageBar
                    used={entitlement.invoicesUsed}
                    limit={entitlement.invoiceLimit}
                    label={entitlement.invoiceLimitPeriod === "MONTH" ? "Bills this month" : "Bills used"}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600">
                {current.status === "PENDING" && "Your last checkout was not completed. Choose a plan below."}
                {current.status === "NONE" && "You don't have a plan yet. Start the free trial or choose a plan below."}
                {current.status === "EXPIRED" && "Your subscription has expired. Renew by choosing a plan below."}
                {current.status === "ENDED" && "Your subscription ended as requested. You can subscribe again any time."}
                {current.status === "CANCELLED" &&
                  `Cancelled on ${formatDay(current.cancelledAt)}${current.cancelReason ? ` — ${current.cancelReason}` : ""}. You can subscribe again any time.`}
              </p>
            )}
          </div>

          {canEdit && !current.onTrial && (
            <div className="flex flex-wrap gap-2">
              {current.status === "CANCELS_AT_PERIOD_END" && (
                <Button variant="primary" onClick={handleResume} loading={resuming}>
                  <RotateCcw className="h-4 w-4" /> Resume subscription
                </Button>
              )}
              {(current.hasAccess || current.status === "PENDING") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCancelMode(current.status === "ACTIVE" ? "PERIOD_END" : "IMMEDIATE");
                    setCancelOpen(true);
                  }}
                >
                  <XCircle className="h-4 w-4" /> Cancel subscription
                </Button>
              )}
            </div>
          )}
        </div>

        {current.renewDue && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Your plan ends in {current.daysLeft} day{current.daysLeft === 1 ? "" : "s"}. Renew now to avoid interruption — the new period starts when the current one ends.
          </div>
        )}
      </div>

      {/* Billing cycle toggle */}
      <div className="flex flex-col items-center gap-2">
        <div role="tablist" aria-label="Billing cycle" className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {(["monthly", "yearly"] as const).map((cycle) => (
            <button
              key={cycle}
              role="tab"
              aria-selected={activeBilling === cycle}
              onClick={() => setBilling(cycle)}
              className={cn(
                "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                activeBilling === cycle ? "bg-blue-600 text-white shadow" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {cycle === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        {yearlySaving > 0 && (
          <p className="text-xs text-slate-500">
            Yearly plans save up to <span className="font-semibold text-green-700">{formatCurrency(yearlySaving)}</span> — about 2 months free
          </p>
        )}
      </div>

      {/* Plans */}
      <div className="grid gap-4 md:grid-cols-3">
        {visiblePlans.map((plan) => {
          const action = planAction(plan);
          const isCurrent = plan.tier === "TRIAL" ? current.onTrial : current.hasAccess && !current.onTrial && current.plan?.id === plan.id;
          const isSelected = selectedTier === plan.tier;
          const isBusy = busyPlanId === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedTier(plan.tier)}
              className={cn(
                "relative flex cursor-pointer flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md",
                isSelected ? "border-blue-600 ring-2 ring-blue-600" : isCurrent ? "border-green-500 ring-1 ring-green-500" : "border-slate-200"
              )}
            >
              {plan.tier === "PRO" && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white">
                  <Sparkles className="h-3 w-3" /> Most popular
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  {plan.tier === "TRIAL" && <Gift className="h-4 w-4 text-green-600" />}
                  {plan.name}
                </h3>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Current
                  </span>
                )}
              </div>
              {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}
              <p className="mt-3">
                {plan.tier === "TRIAL" ? (
                  <>
                    <span className="text-2xl font-bold text-slate-900">Free</span>
                    <span className="text-sm text-slate-500"> · {plan.invoiceLimit} bills</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-slate-900">{formatCurrency(plan.price, plan.currency)}</span>
                    <span className="text-sm text-slate-500"> / {periodLabel(plan.periodMonths)}</span>
                    {plan.periodMonths === 12 && (
                      <span className="block text-xs text-slate-500">≈ {formatCurrency(Math.round(plan.price / 12), plan.currency)} / month</span>
                    )}
                  </>
                )}
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature.text} className={cn("flex items-start gap-2 text-sm", feature.included ? "text-slate-700" : "text-slate-400")}>
                    {feature.included ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span className={cn(!feature.included && "line-through")}>{feature.text}</span>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <div className="mt-5">
                  <Button
                    className="w-full"
                    variant={plan.tier === "PRO" || (plan.tier === "TRIAL" && current.trialAvailable) ? "primary" : "outline"}
                    disabled={action.disabled}
                    loading={isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTier(plan.tier);
                      action.onClick?.();
                    }}
                  >
                    {plan.tier === "TRIAL" ? <Gift className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />} {action.label}
                  </Button>
                  {action.hint && <p className="mt-1.5 text-center text-xs text-slate-500">{action.hint}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment history */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Payment history</h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No subscription payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-5 py-2.5 text-slate-700">{formatDay(p.paidAt ?? p.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-800">{p.planName}</div>
                      <div className="text-xs text-slate-500">{PURPOSE_LABEL[p.purpose] ?? p.purpose}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {p.purpose === "TRIAL"
                        ? `From ${formatDay(p.periodStart)}`
                        : p.periodStart
                          ? `${formatDay(p.periodStart)} – ${formatDay(p.periodEnd)}`
                          : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                      {p.amount === 0 ? "Free" : formatCurrency(p.amount, p.currency)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={PAYMENT_TONE[p.status]}>
                        {p.status === "CREATED" ? "NOT PAID" : p.purpose === "TRIAL" ? "STARTED" : p.status}
                      </Badge>
                      {p.status === "REFUNDED" && p.refundAmount !== null && (
                        <div className="mt-1 text-xs text-slate-500">
                          {formatCurrency(p.refundAmount, p.currency)} {p.refundStatus ? `(${p.refundStatus})` : ""}
                        </div>
                      )}
                      {p.error && <div className="mt-1 max-w-[220px] text-xs text-red-600">{p.error}</div>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                      <div>{p.purpose === "TRIAL" ? "—" : (p.paymentId ?? p.orderId)}</div>
                      {p.method && <div className="font-sans uppercase">{p.method}</div>}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {canEdit && p.canSync && (
                        <Button size="sm" variant="ghost" loading={busyPaymentId === p.id} onClick={() => checkStatus(p)}>
                          <RefreshCw className="h-3.5 w-3.5" /> Check status
                        </Button>
                      )}
                      {canEdit && p.canRetryRefund && (
                        <Button size="sm" variant="outline" loading={busyPaymentId === p.id} onClick={() => retryRefund(p)}>
                          Retry refund
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={cancelOpen} onClose={() => !cancelling && setCancelOpen(false)} title="Cancel subscription" size="md">
        <div className="flex flex-col gap-3">
          {current.status === "ACTIVE" && (
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3",
                cancelMode === "PERIOD_END" ? "border-blue-500 bg-blue-50" : "border-slate-200"
              )}
            >
              <input type="radio" name="cancelMode" className="mt-1" checked={cancelMode === "PERIOD_END"} onChange={() => setCancelMode("PERIOD_END")} />
              <span className="text-sm">
                <span className="block font-medium text-slate-800">At the end of the paid period</span>
                <span className="text-slate-600">
                  Keep using everything until {formatDay(current.paidUntil)}. No refund. You can resume any time before then.
                </span>
              </span>
            </label>
          )}
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-md border p-3",
              cancelMode === "IMMEDIATE" ? "border-red-500 bg-red-50" : "border-slate-200"
            )}
          >
            <input type="radio" name="cancelMode" className="mt-1" checked={cancelMode === "IMMEDIATE"} onChange={() => setCancelMode("IMMEDIATE")} />
            <span className="text-sm">
              <span className="block font-medium text-slate-800">Immediately</span>
              <span className="text-slate-600">
                Access ends now.{" "}
                {current.refundPreview.amount > 0
                  ? `${formatCurrency(current.refundPreview.amount)} will be refunded to the original payment method.`
                  : `No refund — refunds apply only to unstarted prepaid periods and payments made in the last ${policy.refundWindowDays} days.`}
              </span>
              {current.refundPreview.lines.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">
                  {current.refundPreview.lines.map((line) => (
                    <li key={line.paymentId}>
                      {formatCurrency(line.amount)} — {line.reason}
                    </li>
                  ))}
                </ul>
              )}
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor="cancelReason" className="text-sm font-medium text-slate-700">
              Reason (optional)
            </label>
            <textarea
              id="cancelReason"
              rows={2}
              maxLength={500}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep subscription
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>
              {cancelMode === "IMMEDIATE" ? "Cancel now" : "Cancel at period end"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
