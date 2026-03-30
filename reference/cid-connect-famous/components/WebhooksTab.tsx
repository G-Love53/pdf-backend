/**
 * NEW: Admin sub-tab Webhooks — list webhook_events, filters, retry
 */

import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { getWebhookEvents, retryWebhookEvent, type WebhookEventRow } from "@/api";

export default function WebhooksTab() {
  const [rows, setRows] = useState<WebhookEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { rows: r } = await getWebhookEvents({
        limit: 50,
        offset: 0,
        event_type: typeFilter || null,
        status: statusFilter || null,
      });
      setRows(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [typeFilter, statusFilter]);

  async function onRetry(id: string) {
    setRetrying(id);
    try {
      await retryWebhookEvent(id);
      await load();
    } finally {
      setRetrying(null);
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded border border-slate-300 p-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          <option value="email">email</option>
          <option value="api">api</option>
        </select>
        <select
          className="rounded border border-slate-300 p-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="pending">pending</option>
        </select>
        <button type="button" className="text-sm text-orange-600" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Channel</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Retries</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-2 py-2">{r.event_type}</td>
                <td className="px-2 py-2 font-mono text-xs">{r.channel}</td>
                <td className="px-2 py-2">{r.status}</td>
                <td className="px-2 py-2">{r.retry_count}</td>
                <td className="px-2 py-2">
                  {r.status === "failed" && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-orange-600"
                      disabled={retrying === r.id}
                      onClick={() => void onRetry(r.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
