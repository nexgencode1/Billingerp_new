import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "No access" };

// Shown when a page's data request is refused by the backend (HTTP 403) for the user's role.
export default function NoAccessPage() {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">You don&apos;t have access to this page</h1>
      <p className="text-sm text-slate-600">
        Your role doesn&apos;t include permission for this section. Ask your admin to update your role in Users &amp; Roles if you need it.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
