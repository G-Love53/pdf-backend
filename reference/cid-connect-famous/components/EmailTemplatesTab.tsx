/**
 * NEW: Admin sub-tab "Templates" — CRUD email_templates + preview
 * Placeholders: {{reference_number}}, {{extra_context}}, {{user_email}}
 */

import React, { useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import {
  listEmailTemplates,
  upsertEmailTemplate,
  deleteEmailTemplate,
  previewTemplate,
  type EmailTemplateRow,
} from "@/api";

const ENTITY_TYPES = ["claim", "coi", "policy"] as const;
const STATUS_TRIGGERS = [
  "approved",
  "denied",
  "closed",
  "completed",
  "failed",
  "settlement_set",
  "bound",
] as const;

export default function EmailTemplatesTab() {
  const [rows, setRows] = useState<EmailTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailTemplateRow | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await listEmailTemplates();
      setRows(data);
      if (data[0]) setSelected(data[0]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) {
      setPreviewHtml("");
      return;
    }
    const html = previewTemplate(selected.body_template, {
      reference_number: "CLM-DEMO-001",
      user_email: "insured@example.com",
      extra_context: "Sample extra context line.",
    });
    setPreviewHtml(html);
  }, [selected]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`rounded border px-3 py-1 text-sm ${
                selected?.id === r.id ? "border-orange-500 bg-orange-50" : "border-slate-200"
              }`}
              onClick={() => setSelected(r)}
            >
              {r.entity_type}/{r.status_trigger}
            </button>
          ))}
        </div>
        {selected && (
          <div className="space-y-3 rounded border border-slate-200 bg-white p-4">
            <label className="block text-xs font-medium text-slate-500">Subject</label>
            <input
              className="w-full rounded border border-slate-300 p-2 text-sm"
              value={selected.subject_template}
              onChange={(e) => setSelected({ ...selected, subject_template: e.target.value })}
            />
            <label className="block text-xs font-medium text-slate-500">Body (HTML)</label>
            <textarea
              className="min-h-[200px] w-full rounded border border-slate-300 p-2 font-mono text-xs"
              value={selected.body_template}
              onChange={(e) => setSelected({ ...selected, body_template: e.target.value })}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded bg-orange-600 px-3 py-2 text-sm text-white"
                onClick={() => void upsertEmailTemplate(selected).then(load)}
              >
                <Save className="h-4 w-4" />
                Save
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-2 text-sm text-red-700"
                onClick={() => void deleteEmailTemplate(selected.id).then(load)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">
          New row: insert via SQL or add &quot;Add template&quot; form with entity_type +
          status_trigger from lists: {ENTITY_TYPES.join(", ")} / {STATUS_TRIGGERS.join(", ")}
        </p>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Live preview</h3>
        <div
          className="prose prose-sm max-w-none rounded bg-white p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </div>
  );
}
