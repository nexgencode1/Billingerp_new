"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";

interface Suggestion {
  code: string;
  description: string;
  gstRate: number | null;
  source: "HISTORY" | "MASTER";
  usageCount: number;
}

// Suggests HSN + GST rate from (1) your own products and (2) the imported HSN master list, based
// on the product name / HSN typed so far. Picking one fills both fields; the user can still edit.
// Rates are only as current as the imported list. // VERIFY: official rule
export function HsnSuggest({
  name,
  hsn,
  onPick,
}: {
  name: string;
  hsn: string;
  onPick: (code: string, gstRate: number | null) => void;
}) {
  const [history, setHistory] = useState<Suggestion[]>([]);
  const [master, setMaster] = useState<Suggestion[]>([]);
  const [masterCount, setMasterCount] = useState<number | null>(null);
  const query = (hsn.trim().length >= 2 ? hsn : name).trim();

  useEffect(() => {
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/hsn/suggest?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          setHistory(d.history);
          setMaster(d.master);
          setMasterCount(d.masterCount);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const items = query.length < 2 ? [] : [...history, ...master.filter((m) => !history.some((h) => h.code === m.code))];
  if (items.length === 0) {
    return masterCount === 0 && query.length >= 2 ? (
      <p className="text-xs text-slate-400">
        No HSN suggestions yet — import the official HSN list in Settings → Import Data to get suggestions.
      </p>
    ) : null;
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2" data-tour="hsn-suggest">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800">
        <Lightbulb className="h-3.5 w-3.5" /> HSN suggestions — click to fill (verify the rate before saving)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 8).map((s) => (
          <button
            key={`${s.source}-${s.code}-${s.gstRate}`}
            type="button"
            onClick={() => onPick(s.code, s.gstRate)}
            title={s.description}
            className="rounded border border-amber-300 bg-white px-2 py-1 text-left text-xs hover:border-amber-500"
          >
            <span className="font-mono font-semibold text-slate-900">{s.code}</span>
            {s.gstRate !== null && <span className="ml-1 text-slate-700">· {s.gstRate}%</span>}
            <span className="ml-1 text-slate-400">
              {s.source === "HISTORY" ? `used on ${s.usageCount} product${s.usageCount === 1 ? "" : "s"}` : "HSN list"}
            </span>
            <span className="block max-w-56 truncate text-[11px] text-slate-500">{s.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
