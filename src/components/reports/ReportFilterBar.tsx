"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  DATE_PRESETS,
  DEFAULT_PRESET,
  formatRangeLabel,
  rangeForPreset,
  type DatePresetKey,
  type DateRange,
} from "@/lib/dateRanges";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField {
  key: string;
  label: string;
  options: FilterOption[];
}

export interface ReportFilterState {
  preset: DatePresetKey;
  range: DateRange;
  values: Record<string, string>;
}

export function initialFilterState(): ReportFilterState {
  return { preset: DEFAULT_PRESET, range: rangeForPreset(DEFAULT_PRESET), values: {} };
}

// Builds "&key=value" pairs for every non-empty extra filter.
export function filterQuery(state: ReportFilterState): string {
  const params = new URLSearchParams({ from: state.range.from, to: state.range.to });
  for (const [k, v] of Object.entries(state.values)) if (v) params.set(k, v);
  return params.toString();
}

// Human-readable "period · filter: value" line for export headers.
export function describeFilters(state: ReportFilterState, fields: FilterField[] = []): string {
  const parts = [formatRangeLabel(state.range)];
  for (const f of fields) {
    const v = state.values[f.key];
    if (v) parts.push(`${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`);
  }
  return parts.join("  ·  ");
}

// Common filter bar used by every report (and reusable on list pages):
// period preset + from/to dates + any number of dropdown filters + reset.
export function ReportFilterBar({
  state,
  onChange,
  fields = [],
  showDates = true,
}: {
  state: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  fields?: FilterField[];
  showDates?: boolean;
}) {
  const selectClass =
    "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const isDirty =
    state.preset !== DEFAULT_PRESET || Object.values(state.values).some((v) => v);

  function setPreset(preset: DatePresetKey) {
    onChange({ ...state, preset, range: preset === "custom" ? state.range : rangeForPreset(preset) });
  }

  function setDate(part: "from" | "to", value: string) {
    if (!value) return;
    onChange({ ...state, preset: "custom", range: { ...state.range, [part]: value } });
  }

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 print:hidden"
      data-tour="report-filters"
    >
      <SlidersHorizontal className="mb-2 h-4 w-4 text-slate-400" aria-hidden />
      {showDates && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Period
            <select value={state.preset} onChange={(e) => setPreset(e.target.value as DatePresetKey)} className={selectClass}>
              {DATE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            From
            <input
              type="date"
              value={state.range.from}
              max={state.range.to}
              onChange={(e) => setDate("from", e.target.value)}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            To
            <input
              type="date"
              value={state.range.to}
              min={state.range.from}
              onChange={(e) => setDate("to", e.target.value)}
              className={selectClass}
            />
          </label>
        </>
      )}
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          {f.label}
          <select
            value={state.values[f.key] ?? ""}
            onChange={(e) => onChange({ ...state, values: { ...state.values, [f.key]: e.target.value } })}
            className={`${selectClass} min-w-36`}
          >
            <option value="">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {isDirty && (
        <button
          type="button"
          onClick={() => onChange(initialFilterState())}
          className="mb-0.5 inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      )}
    </div>
  );
}
