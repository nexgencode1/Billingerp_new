import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function ReportPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/reports" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 print:hidden">
          <ChevronLeft className="h-3 w-3" /> All Reports
        </Link>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ReportError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Could not load this report: {message}
    </div>
  );
}
