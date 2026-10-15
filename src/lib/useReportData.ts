"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/reports";
import type { FilterOption } from "@/components/reports/ReportFilterBar";

// Fetches a report whenever its URL (i.e. its filters) changes; ignores responses that arrive
// after the filters moved on, so a slow request can't overwrite a newer one.
export function useReportData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<T>(url)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}

// Dropdown options for a filter (customers, suppliers, categories...). A role without access to
// the list endpoint just gets no options — the report itself still works unfiltered.
export function useFilterOptions(url: string, label: (row: Record<string, unknown>) => string = (r) => String(r.name)) {
  const [options, setOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        setOptions(
          (rows as Record<string, unknown>[])
            .map((r) => ({ value: String(r.id), label: label(r) }))
            .sort((a, b) => a.label.localeCompare(b.label))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return options;
}
