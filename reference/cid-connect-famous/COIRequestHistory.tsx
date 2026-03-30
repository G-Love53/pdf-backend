/**
 * New file: src/components/services/COIRequestHistory.tsx
 * Add route + Services entry (see integration-notes.ts)
 */

import React, { useEffect, useState } from "react";
import { Loader2, Filter } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getUserCoiRequests } from "@/api";

type Row = {
  id: string;
  request_number: string | null;
  holder_name?: string | null;
  certificate_holder_name?: string | null;
  delivery_email?: string | null;
  status: string | null;
  created_at: string | null;
};

const STATUSES = ["all", "submitted", "processing", "completed", "failed"] as const;

export default function COIRequestHistory({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const data = await getUserCoiRequests(user.id);
        setRows(data as Row[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered =
    filter === "all" ? rows : rows.filter((r) => (r.status || "").toLowerCase() === filter);

  function badgeClass(status: string | null) {
    const s = (status || "").toLowerCase();
    if (s === "completed") return "bg-emerald-100 text-emerald-800";
    if (s === "failed") return "bg-red-100 text-red-800";
    if (s === "processing") return "bg-blue-100 text-blue-800";
    return "bg-slate-100 text-slate-800";
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <button type="button" onClick={onBack} className="text-sm text-slate-500">
        ← Back
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-900">COI request history</h2>
        <div className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            className="rounded border border-slate-300 p-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value as (typeof STATUSES)[number])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-slate-600">No COI requests yet.</p>
      )}

      <ul className="space-y-3">
        {filtered.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-900">
                  {r.request_number || r.id}
                </p>
                <p className="text-slate-700">
                  {r.certificate_holder_name || r.holder_name || "—"}
                </p>
                <p className="text-sm text-slate-500">{r.delivery_email || "—"}</p>
                <p className="text-xs text-slate-400">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${badgeClass(r.status)}`}
              >
                {r.status || "submitted"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
