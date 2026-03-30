/**
 * NEW: src/components/admin/AuditLogTab.tsx — embed as AdminDashboard tab "Audit Log"
 */

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getRecentAuditLogs, type AuditLogRow } from "@/api";

export default function AuditLogTab() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityFilter, setEntityFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecentAuditLogs({
        limit: 50,
        action: actionFilter || null,
        entity_type: entityFilter || null,
      });
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [actionFilter, entityFilter]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-slate-300 p-2 text-sm"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          <option value="claim_status_change">Claim status</option>
          <option value="claim_settlement">Settlement</option>
          <option value="claim_bulk_update">Bulk claims</option>
          <option value="coi_status_change">COI status</option>
          <option value="coi_bulk_update">Bulk COI</option>
          <option value="coi_pdf_url">COI PDF URL</option>
        </select>
        <select
          className="rounded border border-slate-300 p-2 text-sm"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        >
          <option value="">All entities</option>
          <option value="claim">claim</option>
          <option value="coi_request">coi_request</option>
          <option value="policy">policy</option>
        </select>
        <button
          type="button"
          className="text-sm text-orange-600"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{r.admin_email || r.admin_user_id}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2">{r.entity_type}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.entity_reference || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
