"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, Lock, Receipt, Search, X } from "lucide-react";
import { NAV_GROUPS, filterNavGroups } from "@/constants/nav";
import { cn } from "@/lib/utils";
import { featureForPath, isFeatureLocked, usePlanStore } from "@/lib/plan-store";

export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-yellow-100 px-0.5 text-inherit">{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

export function Sidebar({ permissions }: { permissions: Record<string, string[]> }) {
  const pathname = usePathname();
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleGroups = NAV_GROUPS.filter((g) => Boolean(permissions[g.module]?.length));
  const shownGroups = filterNavGroups(visibleGroups, query);
  const filtering = query.trim().length > 0;

  const initiallyOpen = new Set(
    visibleGroups
      .filter((g) => g.children?.some((c) => pathname.startsWith(c.href)))
      .map((g) => g.label)
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(initiallyOpen);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      const first = shownGroups[0];
      const href = first?.children?.[0]?.href ?? first?.href;
      if (href) {
        router.push(href);
        setQuery("");
      }
    }
  }

  return (
    <aside className="app-chrome hidden md:flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link href="/dashboard" className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 hover:bg-slate-50">
        <Receipt className="h-6 w-6 text-blue-600" />
        <span className="text-base font-bold text-slate-900">Billing ERP</span>
      </Link>

      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter menu…"
            aria-label="Filter menu"
            className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 text-sm text-slate-800 placeholder:text-slate-400 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {filtering && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {filtering && shownGroups.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-slate-500">No menu item matches “{query.trim()}”.</p>
        )}
        {shownGroups.map((group) => {
          const Icon = group.icon;
          if (!group.children) {
            const active = pathname === group.href;
            return (
              <Link
                key={group.label}
                href={group.href ?? "#"}
                data-tour={group.tourId}
                onClick={() => setQuery("")}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                <Highlight text={group.label} query={query} />
              </Link>
            );
          }

          const isOpen = filtering || openGroups.has(group.label);
          const groupActive = group.children.some((c) => pathname.startsWith(c.href));

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                data-tour={group.tourId}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  groupActive ? "text-blue-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                <span className="flex-1 text-left">
                  <Highlight text={group.label} query={query} />
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="ml-6 flex flex-col gap-0.5 border-l border-slate-200 pl-3 py-1">
                  {group.children.map((child) => {
                    // Longest matching href wins, so "/reports" isn't also lit on "/reports/sales".
                    const bestMatch = group.children!
                      .filter((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
                      .sort((a, b) => b.href.length - a.href.length)[0];
                    const active = bestMatch?.href === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setQuery("")}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                          active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <span>
                          <Highlight text={child.label} query={query} />
                        </span>
                        {isFeatureLocked(plan, featureForPath(child.href)) && (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Not in your plan" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
