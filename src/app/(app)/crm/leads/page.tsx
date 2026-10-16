"use client";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

import { useState } from "react";
import Link from "next/link";
import { Plus, Eye } from "lucide-react";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { Modal } from "@/components/common/Modal";
import { Button, Input, Select } from "@/components/common";
import { Badge } from "@/components/common/Badge";
import { useCrud } from "@/lib/useCrud";

const STATUS_TONE: Record<string, "slate" | "blue" | "yellow" | "green" | "red"> = {
  NEW: "slate",
  CONTACTED: "blue",
  QUALIFIED: "blue",
  PROPOSAL: "yellow",
  WON: "green",
  LOST: "red",
};

interface LeadRow {
  id: number;
  name: string;
  mobile: string | null;
  email: string | null;
  source: string | null;
  status: string;
  assignedTo: { name: string } | null;
  _count: { activities: number };
}

const emptyForm = { name: "", mobile: "", email: "", source: "", notes: "" };

export default function LeadsPage() {
  useDocumentTitle("Leads");
  const { items, loading, create } = useCrud<LeadRow>("/api/crm/leads");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const ok = await create({ ...form, status: "NEW" });
    setSaving(false);
    if (ok) {
      setModalOpen(false);
      setForm(emptyForm);
    }
  }

  const columns: Column<LeadRow>[] = [
    { key: "name", header: "Lead Name", sortable: true },
    { key: "mobile", header: "Mobile", render: (r) => r.mobile ?? "-" },
    { key: "email", header: "Email", render: (r) => r.email ?? "-" },
    { key: "source", header: "Source", render: (r) => r.source ?? "-" },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
      exportValue: (r) => r.status,
    },
    { key: "assignedTo", header: "Assigned To", render: (r) => r.assignedTo?.name ?? "-", exportValue: (r) => r.assignedTo?.name ?? "" },
    { key: "activities", header: "Follow-ups", render: (r) => r._count.activities, exportValue: (r) => r._count.activities },
  ];

  return (
    <div data-tour="tour-crm" className="flex flex-col gap-4">
      <DataTable
        title="Leads"
        columns={columns}
        data={items}
        loading={loading}
        searchKeys={["name", "mobile", "email"]}
        exportFilename="leads"
        rowKey={(r) => r.id}
        addButton={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        }
        rowActions={(row) => (
          <Link href={`/crm/leads/${row.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
        )}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Lead" size="sm">
        <div className="flex flex-col gap-3">
          <Input label="Lead Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="">Select source</option>
            <option value="Website">Website</option>
            <option value="Referral">Referral</option>
            <option value="Walk-in">Walk-in</option>
            <option value="Phone">Phone</option>
            <option value="Social Media">Social Media</option>
            <option value="Other">Other</option>
          </Select>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!form.name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
