/**
 * Embed in AdminDashboard.tsx: <AdminCoiSection />
 * Requires staff/admin RLS on coi_requests SELECT/UPDATE.
 */

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminListCoiRequests, adminUpdateCoiRequest } from "@/api";

type CoiRow = {
  id: string;
  request_number: string | null;
  user_id: string | null;
  certificate_holder_name?: string | null;
  holder_name?: string | null;
  delivery_email?: string | null;
  status: string | null;
  created_at: string | null;
  generated_pdf_url?: string | null;
};

export default function AdminCoiSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CoiRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListCoiRequests();
      setRows(data as CoiRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onStatusChange(id: string, status: string) {
    await adminUpdateCoiRequest(id, { status });
    await load();
  }

  async function onPdfBlur(id: string, url: string) {
    const trimmed = url.trim();
    await adminUpdateCoiRequest(id, {
      generated_pdf_url: trimmed || null,
    });
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">COI requests (all users)</h3>
        <button
          type="button"
          className="text-sm text-orange-600"
          onClick={() => load()}
        >
          Refresh
        </button>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th className="py-2 pr-4">Request #</th>
            <th className="py-2 pr-4">User</th>
            <th className="py-2 pr-4">Holder</th>
            <th className="py-2 pr-4">Delivery email</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Generated PDF URL</th>
            <th className="py-2 pr-4">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-4 font-mono text-xs">{r.request_number}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.user_id}</td>
              <td className="py-2 pr-4">
                {r.certificate_holder_name || r.holder_name || "—"}
              </td>
              <td className="py-2 pr-4">{r.delivery_email || "—"}</td>
              <td className="py-2 pr-4">
                <select
                  className="rounded border border-slate-300 p-1 text-xs"
                  value={r.status || "submitted"}
                  onChange={(e) => onStatusChange(r.id, e.target.value)}
                >
                  <option value="submitted">submitted</option>
                  <option value="processing">processing</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                </select>
              </td>
              <td className="py-2 pr-4">
                <input
                  defaultValue={r.generated_pdf_url || ""}
                  className="w-48 rounded border border-slate-300 p-1 text-xs"
                  placeholder="https://..."
                  onBlur={(e) => onPdfBlur(r.id, e.target.value)}
                />
              </td>
              <td className="py-2 pr-4 text-xs text-slate-500">
                {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
