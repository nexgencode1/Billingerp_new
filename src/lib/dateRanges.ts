export interface DateRange {
  from: string;
  to: string;
}

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "last30"
  | "thisQuarter"
  | "thisFy"
  | "lastFy"
  | "last6Months"
  | "custom";

// Local-date ISO string (yyyy-mm-dd) — toISOString() would shift to UTC and can return
// "yesterday" for IST users early in the morning.
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Indian financial year runs April → March.
function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function rangeForPreset(key: Exclude<DatePresetKey, "custom">, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const r = (from: Date, to: Date): DateRange => ({ from: toIsoDate(from), to: toIsoDate(to) });

  switch (key) {
    case "today":
      return r(today, today);
    case "yesterday":
      return r(addDays(today, -1), addDays(today, -1));
    case "thisWeek": {
      const mondayOffset = (today.getDay() + 6) % 7;
      return r(addDays(today, -mondayOffset), today);
    }
    case "last7":
      return r(addDays(today, -6), today);
    case "thisMonth":
      return r(new Date(y, m, 1), today);
    case "lastMonth":
      return r(new Date(y, m - 1, 1), new Date(y, m, 0));
    case "last30":
      return r(addDays(today, -29), today);
    case "thisQuarter": {
      // FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar — calendar quarters line up with these.
      const qStartMonth = Math.floor(m / 3) * 3;
      return r(new Date(y, qStartMonth, 1), today);
    }
    case "thisFy":
      return r(new Date(fyStartYear(today), 3, 1), today);
    case "lastFy": {
      const start = fyStartYear(today) - 1;
      return r(new Date(start, 3, 1), new Date(start + 1, 2, 31));
    }
    case "last6Months":
      return r(new Date(y, m - 5, 1), today);
  }
}

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "last7", label: "Last 7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "thisQuarter", label: "This Quarter" },
  { key: "last6Months", label: "Last 6 Months" },
  { key: "thisFy", label: "This Financial Year" },
  { key: "lastFy", label: "Last Financial Year" },
  { key: "custom", label: "Custom Range" },
];

export const DEFAULT_PRESET: Exclude<DatePresetKey, "custom"> = "thisMonth";

export function defaultRange(): DateRange {
  return rangeForPreset(DEFAULT_PRESET);
}

// Day buckets for short ranges, month buckets for anything longer than ~2 months.
export function trendGrouping(range: DateRange): "day" | "month" {
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  return days <= 62 ? "day" : "month";
}

export function formatRangeLabel(range: DateRange): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return range.from === range.to ? fmt(range.from) : `${fmt(range.from)} – ${fmt(range.to)}`;
}
