/**
 * NEW: src/components/services/CarrierDetail.tsx
 * serviceView: 'carrier-detail' — selectedCarrierId from MainApp state
 */

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getCarrierById, type CarrierRow } from "@/api";
import CarrierResourcesSection from "@/components/CarrierResourcesSection";

type Props = {
  carrierId: string;
  onBack: () => void;
};

function Stars({ rating }: { rating: number | null }) {
  if (rating == null || Number.isNaN(rating)) return <span className="text-slate-400">—</span>;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const out = [];
  for (let i = 0; i < full; i++) out.push("★");
  if (half) out.push("½");
  while (out.length < 5) out.push("☆");
  return (
    <span className="text-amber-500" title={`${rating.toFixed(1)} / 5`}>
      {out.slice(0, 5).join(" ")}
    </span>
  );
}

export default function CarrierDetail({ carrierId, onBack }: Props) {
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const row = await getCarrierById(carrierId);
        if (!cancelled) setCarrier(row);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carrierId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (err || !carrier) {
    return (
      <div className="p-4">
        <button type="button" onClick={onBack} className="text-sm text-slate-600">
          ← Back
        </button>
        <p className="mt-4 text-red-600">{err || "Carrier not found"}</p>
      </div>
    );
  }

  const segments = (carrier.segments || []).filter(Boolean);
  const resourceSegment = segments[0] ?? "";

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="space-y-6 p-4">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:flex-row sm:text-left">
          {carrier.logo_url ? (
            <img
              src={carrier.logo_url}
              alt=""
              className="h-20 max-w-[200px] object-contain"
            />
          ) : (
            <div className="flex h-20 w-40 items-center justify-center rounded bg-slate-100 text-slate-400">
              No logo
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900">{carrier.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Stars rating={carrier.rating} />
              {carrier.rating != null && (
                <span className="text-sm text-slate-500">{carrier.rating.toFixed(1)} / 5</span>
              )}
            </div>
          </div>
        </div>

        {carrier.description && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">About</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{carrier.description}</p>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">Segments covered</h2>
          <ul className="flex flex-wrap gap-2">
            {segments.length === 0 ? (
              <li className="text-sm text-slate-500">—</li>
            ) : (
              segments.map((s) => (
                <li
                  key={s}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium capitalize text-orange-800"
                >
                  {s}
                </li>
              ))
            )}
          </ul>
        </section>

        {resourceSegment ? (
          <CarrierResourcesSection carrierName={carrier.name} segment={resourceSegment} />
        ) : null}
      </div>
    </div>
  );
}
