/**
 * MERGE into api.ts or AdminDashboard helper file.
 * Requires getAllClaims() returning full claim rows including settlement_* fields.
 */

import { getAllClaims } from "@/api";
import { escapeCsvCell, formatMoneyCsv } from "@/lib/csvDownload";

export async function downloadSettlementReportCsv(): Promise<void> {
  const claims = await getAllClaims();
  const withSettlement = (claims as Record<string, unknown>[]).filter(
    (c) => c.settlement_amount != null && c.settlement_amount !== "",
  );

  const headers = [
    "claim_number",
    "segment",
    "status",
    "estimated_amount",
    "settlement_amount",
    "settlement_date",
    "created_at",
  ] as const;

  const lines: string[] = [headers.join(",")];

  for (const c of withSettlement) {
    const estimated = formatMoneyCsv(
      c.estimated_amount as number | string | null | undefined,
    );
    const settled = formatMoneyCsv(c.settlement_amount as number | string | null | undefined);
    const row = [
      escapeCsvCell(c.claim_number as string | undefined),
      escapeCsvCell((c.segment as string | undefined) ?? ""),
      escapeCsvCell((c.status as string | undefined) ?? ""),
      escapeCsvCell(estimated ? `$${estimated}` : ""),
      escapeCsvCell(settled ? `$${settled}` : ""),
      escapeCsvCell((c.settlement_date as string | undefined) ?? ""),
      escapeCsvCell((c.created_at as string | undefined) ?? ""),
    ];
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cid-settlement-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
