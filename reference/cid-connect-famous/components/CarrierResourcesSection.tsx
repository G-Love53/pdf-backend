/**
 * Embed inside CarrierDetail.tsx below segments section.
 * Props: carrierName, segment (one segment to filter resources — e.g. first of carrier.segments)
 */

import React, { useEffect, useState } from "react";
import { Download, Loader2, FolderOpen } from "lucide-react";
import { getCarrierResources, downloadCarrierResource, type CarrierResourceRow } from "@/api";

type Props = {
  carrierName: string;
  segment: string;
};

function groupByType(rows: CarrierResourceRow[]) {
  const map = new Map<string, CarrierResourceRow[]>();
  for (const r of rows) {
    const t = (r.resource_type || "Other").trim();
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(r);
  }
  return map;
}

export default function CarrierResourcesSection({ carrierName, segment }: Props) {
  const [rows, setRows] = useState<CarrierResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!carrierName?.trim() || !segment?.trim()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const data = await getCarrierResources(carrierName.trim(), segment.trim());
        if (!cancelled) setRows(data);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load resources");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carrierName, segment]);

  if (!segment?.trim()) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading resources…
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-amber-700">{err}</p>;
  }

  if (rows.length === 0) {
    return (
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
          <FolderOpen className="h-3 w-3" />
          Resources
        </h2>
        <p className="text-sm text-slate-500">No resources for this segment.</p>
      </section>
    );
  }

  const grouped = groupByType(rows);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
        <FolderOpen className="h-3 w-3" />
        Resources <span className="font-normal normal-case text-slate-400">({segment})</span>
      </h2>
      <div className="space-y-6">
        {[...grouped.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([type, list]) => (
            <div key={type}>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{type}</h3>
              <ul className="space-y-2">
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-slate-800">{r.title || r.file_path || "File"}</span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800 hover:bg-orange-100"
                      onClick={() => void downloadCarrierResource(r)}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}
