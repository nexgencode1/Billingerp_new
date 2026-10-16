"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, ShoppingCart, Package, Boxes, Menu, Search, X } from "lucide-react";
import { NAV_GROUPS, filterNavGroups } from "@/constants/nav";
import { Highlight } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

const QUICK_LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Sales", href: "/sales/new", icon: ShoppingCart },
  { label: "Products", href: "/products", icon: Package },
  { label: "Stock", href: "/inventory/stock", icon: Boxes },
];

export function MobileNav({ permissions }: { permissions: Record<string, string[]> }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const visibleGroups = NAV_GROUPS.filter((g) => Boolean(permissions[g.module]?.length));
  const shownGroups = filterNavGroups(visibleGroups, query);

  function closeDrawer() {
    setDrawerOpen(false);
    setQuery("");
  }

  return (
    <>
      <nav className="app-chrome fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-slate-200 bg-white md:hidden">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-xs",
                active ? "text-blue-700" : "text-slate-500"
              )}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 text-xs text-slate-500"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <div className="relative ml-auto flex h-full w-72 flex-col overflow-y-auto bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-semibold">Menu</span>
              <button onClick={closeDrawer} aria-label="Close menu">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter menu…"
                aria-label="Filter menu"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {shownGroups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No menu item matches “{query.trim()}”.</p>}
            {shownGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
                  <Highlight text={group.label} query={query} />
                </p>
                <div className="flex flex-col gap-1">
                  {(group.children ?? [{ label: group.label, href: group.href ?? "#" }]).map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={closeDrawer}
                      className="rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Highlight text={child.label} query={query} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
