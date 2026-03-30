/**
 * MERGE into api.ts — all claims CSV (not settlement-only).
 * Reuse escapeCsvCell + formatMoneyCsv from same module as settlement export.
 */

import { getAllClaims } from "@/api";
import { escapeCsvCell, formatMoneyCsv } from "@/lib/csvDownload";

export async function downloadAllClaimsReportCsv(): Promise<void> {
  const claims = await getAllClaims();

  const headers = [
    "claim_number",
    "segment",
    "status",
    "claim_type",
    "incident_date",
    "estimated_amount",
    "settlement_amount",
    "settlement_date",
    "description",
    "created_at",
  ] as const;

  const lines: string[] = [headers.join(",")];

  for (const c of claims as Record<string, unknown>[]) {
    const est = formatMoneyCsv(c.estimated_amount as number | string | null | undefined);
    const set = formatMoneyCsv(c.settlement_amount as number | string | null | undefined);
    const desc = (c.description as string | undefined) ?? "";
    const row = [
      escapeCsvCell(c.claim_number as string | undefined),
      escapeCsvCell((c.segment as string | undefined) ?? ""),
      escapeCsvCell((c.status as string | undefined) ?? ""),
      escapeCsvCell((c.claim_type as string | undefined) ?? ""),
      escapeCsvCell((c.incident_date as string | undefined) ?? ""),
      escapeCsvCell(est ? `$${est}` : ""),
      escapeCsvCell(set ? `$${set}` : ""),
      escapeCsvCell((c.settlement_date as string | undefined) ?? ""),
      escapeCsvCell(desc),
      escapeCsvCell((c.created_at as string | undefined) ?? ""),
    ];
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cid-all-claims-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
