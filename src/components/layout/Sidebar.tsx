"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Receipt } from "lucide-react";
import { NAV_GROUPS } from "@/constants/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ permissions }: { permissions: Record<string, string[]> }) {
  const pathname = usePathname();

  const visibleGroups = NAV_GROUPS.filter((g) => Boolean(permissions[g.module]?.length));

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

  return (
    <aside className="app-chrome hidden md:flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link href="/dashboard" className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 hover:bg-slate-50">
        <Receipt className="h-6 w-6 text-blue-600" />
        <span className="text-base font-bold text-slate-900">Billing ERP</span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          if (!group.children) {
            const active = pathname === group.href;
            return (
              <Link
                key={group.label}
                href={group.href ?? "#"}
                data-tour={group.tourId}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                {group.label}
              </Link>
            );
          }

          const isOpen = openGroups.has(group.label);
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
                <span className="flex-1 text-left">{group.label}</span>
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
                        className={cn(
                          "rounded-md px-2 py-1.5 text-sm",
                          active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {child.label}
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
