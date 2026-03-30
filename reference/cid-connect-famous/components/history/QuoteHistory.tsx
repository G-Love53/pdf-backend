/**
 * Target: src/components/history/QuoteHistory.tsx
 * MainApp: <QuoteHistory onBack={handleBackToServices} onOpenQuote={handleOpenQuoteFromHistory} />
 */

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getUserQuotes } from "@/api";

export type QuoteRow = {
  id: string;
  quote_id?: string | null;
  segment?: string | null;
  premium?: number | string | null;
  status?: string | null;
  eligibility?: string | null;
  eligibility_status?: string | null;
  carrier_name?: string | null;
  created_at?: string | null;
};

type Props = {
  onBack: () => void;
  onOpenQuote: (quote: QuoteRow) => void | Promise<void>;
};

function money(n: number | string | null | undefined) {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
}

function eligibilityBadge(row: QuoteRow) {
  const raw =
    (row.eligibility_status || row.eligibility || row.status || "").toLowerCase();
  if (raw.includes("approv")) return { label: "Approved", className: "bg-emerald-100 text-emerald-800" };
  if (raw.includes("declin")) return { label: "Declined", className: "bg-red-100 text-red-800" };
  if (raw.includes("review")) return { label: "Review required", className: "bg-amber-100 text-amber-800" };
  return { label: row.eligibility_status || row.status || "—", className: "bg-slate-100 text-slate-800" };
}

export default function QuoteHistory({ onBack, onOpenQuote }: Props) {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
        const data = await getUserQuotes(user.id);
        if (!cancelled) setRows(data as QuoteRow[]);
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (err) {
    return <p className="p-4 text-red-600">{err}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
      <h2 className="text-xl font-bold text-slate-900">Quote history</h2>

      {rows.length === 0 && <p className="text-sm text-slate-500">No quotes yet.</p>}

      <ul className="space-y-3">
        {rows.map((q) => {
          const elig = eligibilityBadge(q);
          const isQuoted = (q.status || "").toLowerCase() === "quoted";
          const openId = q.quote_id || q.id;

          return (
            <li
              key={q.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">
                  {q.quote_id || q.id}
                </span>
                {q.segment && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
                    {q.segment}
                  </span>
                )}
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-900">{money(q.premium)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${elig.className}`}>
                  {elig.label}
                </span>
                {q.carrier_name && (
                  <span className="text-sm text-slate-600">{q.carrier_name}</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {q.created_at ? new Date(q.created_at).toLocaleString() : ""}
              </p>

              {isQuoted && openId && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                    onClick={() => void onOpenQuote(q)}
                  >
                    Open quote
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
