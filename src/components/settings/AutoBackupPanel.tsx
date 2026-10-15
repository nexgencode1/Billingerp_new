"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Download, FolderClock } from "lucide-react";
import { Button } from "@/components/common/Button";
import { toast } from "@/lib/toast-store";

interface AutoBackupStatus {
  enabled: boolean;
  directory: string;
  runAtHour: number;
  keepCount: number;
  files: { name: string; sizeBytes: number; createdAt: string }[];
}

function size(bytes: number) {
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

// Settings → Backup: daily automatic backups to a folder on the server. Pointing that folder at a
// Google Drive / OneDrive / Dropbox desktop-sync folder gives free off-site cloud backup.
export function AutoBackupPanel() {
  const [status, setStatus] = useState<AutoBackupStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/settings/backup/auto")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, [reload]);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/settings/backup/auto/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Backup failed.");
      else toast.success(`Backup saved: ${data.name}`);
      setReload((n) => n + 1);
    } finally {
      setRunning(false);
    }
  }

  if (!status) return null;
  const hour = `${String(status.runAtHour).padStart(2, "0")}:00`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5" data-tour="auto-backup">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FolderClock className="h-4 w-4 text-slate-400" /> Automatic Daily Backup
          </h2>
          <p className="text-sm text-slate-500">
            {status.enabled ? `On — every day at ${hour}, keeping the latest ${status.keepCount} files.` : "Off (Backup:AutoEnabled = false)."}
          </p>
        </div>
        <Button variant="outline" size="sm" loading={running} onClick={runNow}>
          <CloudUpload className="h-4 w-4" /> Backup now
        </Button>
      </div>
      <p className="mb-3 break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-600">{status.directory}</p>
      <p className="mb-3 text-xs text-slate-500">
        <b>Free cloud backup:</b> install Google Drive for desktop (or OneDrive / Dropbox), then set <code>Backup:Directory</code> in the
        backend&apos;s appsettings to a folder inside it — every backup is then copied to the cloud automatically. The first backup after
        a restart can take up to a minute.
      </p>
      {status.files.length === 0 ? (
        <p className="text-sm text-slate-400">No automatic backups yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {status.files.slice(0, 7).map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate">
                {new Date(f.createdAt).toLocaleString("en-IN")} <span className="text-xs text-slate-400">· {size(f.sizeBytes)}</span>
              </span>
              <a href={`/api/settings/backup/auto/files/${encodeURIComponent(f.name)}`} download className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
