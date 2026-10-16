"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast-store";
import { usePlanStore } from "@/lib/plan-store";

// The landing page's "Start Free Trial" sends the user to /dashboard?startTrial=1 (via login if
// needed). This starts the trial once, then removes the flag from the URL.
export function TrialStarter() {
  const started = useRef(false);
  const refresh = usePlanStore((s) => s.refresh);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("startTrial") !== "1" || started.current) return;
    started.current = true;
    url.searchParams.delete("startTrial");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);

    (async () => {
      const res = await fetch("/api/subscription/trial", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) toast.success("Your free trial has started — 10 bills free with every feature.");
      else if (res.status === 403) toast.info("Ask your admin to start the free trial from Settings → Subscription.");
      else toast.info(data.error ?? "Could not start the free trial.");
      await refresh();
    })();
  }, [refresh]);

  return null;
}
