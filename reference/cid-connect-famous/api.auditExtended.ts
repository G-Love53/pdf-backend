/**
 * MERGE into api.ts — extend getRecentAuditLogs + CSV + pagination
 */

import { supabase } from "@/lib/supabase";
import { escapeCsvCell } from "@/lib/csvDownload";

export type AuditLogFilters = {
  action?: string | null;
  entity_type?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
  offset?: number;
};

export async function getRecentAuditLogs(opts: AuditLogFilters) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(0, opts.offset ?? 0);

  let q = supabase
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.action) q = q.eq("action", opts.action);
  if (opts.entity_type) q = q.eq("entity_type", opts.entity_type);
  if (opts.startDate) q = q.gte("created_at", `${opts.startDate}T00:00:00.000Z`);
  if (opts.endDate) q = q.lte("created_at", `${opts.endDate}T23:59:59.999Z`);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function downloadAuditLogCsv(filters: AuditLogFilters): Promise<void> {
  const pageSize = 500;
  let offset = 0;
  const lines: string[] = [
    ["timestamp", "admin_email", "action", "entity_type", "entity_id", "details"].join(","),
  ];

  for (;;) {
    const { rows: batch } = await getRecentAuditLogs({
      ...filters,
      limit: pageSize,
      offset,
    });

    for (const r of batch as Record<string, unknown>[]) {
      const details = r.details ?? r.old_value ?? r.new_value;
      const detailStr =
        typeof details === "string" ? details : JSON.stringify(details ?? null);
      lines.push(
        [
          escapeCsvCell(String(r.created_at ?? "")),
          escapeCsvCell(String(r.admin_email ?? "")),
          escapeCsvCell(String(r.action ?? "")),
          escapeCsvCell(String(r.entity_type ?? "")),
          escapeCsvCell(String(r.entity_id ?? "")),
          escapeCsvCell(detailStr),
        ].join(","),
      );
    }

    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 50000) break;
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
