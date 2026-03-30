/**
 * NEW: src/components/services/CarrierBrowser.tsx
 * serviceView: 'browse-carriers' — MainApp passes onSelectCarrier(id) → handleCarrierDetail(id)
 */

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { getActiveCarriers } from "@/api";

type CarrierRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  segments?: string[] | null;
  rating?: number | null;
  description?: string | null;
};

type Props = {
  onBack: () => void;
  onSelectCarrier: (carrierId: string) => void;
};

export default function CarrierBrowser({ onBack, onSelectCarrier }: Props) {
  const [rows, setRows] = useState<CarrierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await getActiveCarriers();
        if (!cancelled) setRows(data);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const segs = (c.segments || []).join(" ").toLowerCase();
      return name.includes(s) || segs.includes(s);
    });
  }, [rows, q]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Browse carriers</h1>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name or segment…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {err && <p className="p-4 text-red-600">{err}</p>}

      <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectCarrier(c.id)}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300"
          >
            {c.logo_url ? (
              <img src={c.logo_url} alt="" className="mb-3 h-12 self-start object-contain" />
            ) : (
              <div className="mb-3 flex h-12 w-24 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">
                Logo
              </div>
            )}
            <span className="font-semibold text-slate-900">{c.name}</span>
            {c.rating != null && (
              <span className="mt-1 text-sm text-amber-600">★ {c.rating.toFixed(1)}</span>
            )}
            <div className="mt-2 flex flex-wrap gap-1">
              {(c.segments || []).map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-orange-50 px-2 py-0.5 text-xs capitalize text-orange-800"
                >
                  {s}
                </span>
              ))}
            </div>
            {c.description && (
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.description}</p>
            )}
          </button>
        ))}
      </div>

      {!err && filtered.length === 0 && (
        <p className="p-4 text-center text-sm text-slate-500">No carriers match your search.</p>
      )}
    </div>
  );
}
