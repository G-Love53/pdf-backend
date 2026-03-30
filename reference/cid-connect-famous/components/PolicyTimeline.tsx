/**
 * NEW: src/components/services/PolicyTimeline.tsx
 * MainApp: serviceView 'policy-timeline', state selectedPolicyId
 * PolicyVault: View Timeline → opens with policy id
 */

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, FileText, Sparkles, Shield, CreditCard, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type TimelineEvent = {
  id: string;
  label: string;
  date: string | null;
  icon: "quote" | "analysis" | "bound" | "payment" | "renewal";
};

type Props = {
  policyId: string;
  onBack: () => void;
};

function iconFor(kind: TimelineEvent["icon"]) {
  switch (kind) {
    case "quote":
      return FileText;
    case "analysis":
      return Sparkles;
    case "bound":
      return Shield;
    case "payment":
      return CreditCard;
    case "renewal":
      return Calendar;
    default:
      return FileText;
  }
}

export default function PolicyTimeline({ policyId, onBack }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: pol, error } = await supabase
        .from("policies")
        .select("*")
        .eq("id", policyId)
        .maybeSingle();

      if (error || !pol) {
        if (!cancelled) setEvents([]);
        if (!cancelled) setLoading(false);
        return;
      }

      const p = pol as Record<string, unknown>;
      setTitle(String(p.policy_number ?? "Policy"));

      const quoteId = (p.quote_id as string | undefined) || null;
      let quote: Record<string, unknown> | null = null;
      if (quoteId) {
        const { data: q } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
        quote = (q as Record<string, unknown>) ?? null;
      }
      if (!quote && p.quote_id == null) {
        const { data: q2 } = await supabase
          .from("quotes")
          .select("*")
          .eq("user_id", p.user_id as string)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        quote = (q2 as Record<string, unknown>) ?? null;
      }

      const ev: TimelineEvent[] = [];

      if (quote?.created_at) {
        ev.push({
          id: "quote-created",
          label: "Quote created",
          date: String(quote.created_at),
          icon: "quote",
        });
      }
      if (quote?.updated_at && quote.updated_at !== quote.created_at) {
        ev.push({
          id: "quote-analyzed",
          label: "Quote analyzed",
          date: String(quote.updated_at),
          icon: "analysis",
        });
      }
      if (p.created_at) {
        ev.push({
          id: "policy-bound",
          label: "Policy bound",
          date: String(p.created_at),
          icon: "bound",
        });
      }
      const pay = p.first_payment_date ?? p.payment_date;
      if (pay) {
        ev.push({
          id: "first-payment",
          label: "First payment",
          date: String(pay),
          icon: "payment",
        });
      }
      const renewal = p.renewal_date ?? p.expiration_date ?? p.end_date;
      if (renewal) {
        ev.push({
          id: "renewal",
          label: "Renewal / term end",
          date: String(renewal),
          icon: "renewal",
        });
      }

      ev.sort((a, b) => {
        const ta = a.date ? new Date(a.date).getTime() : 0;
        const tb = b.date ? new Date(b.date).getTime() : 0;
        return ta - tb;
      });

      if (!cancelled) setEvents(ev);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [policyId]);

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
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Policy timeline</h1>
        <p className="font-mono text-sm text-slate-600">{title}</p>
      </div>

      <div className="relative mx-auto max-w-lg p-4">
        <div className="absolute bottom-0 left-8 top-0 w-0.5 bg-slate-200" />
        <ul className="space-y-6">
          {events.map((e) => {
            const Icon = iconFor(e.icon);
            return (
              <li key={e.id} className="relative flex gap-4 pl-1">
                <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white bg-orange-100 text-orange-700">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-slate-900">{e.label}</p>
                  <p className="text-sm text-slate-500">
                    {e.date ? new Date(e.date).toLocaleString() : "—"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {events.length === 0 && (
          <p className="text-sm text-slate-500">No timeline events found for this policy.</p>
        )}
      </div>
    </div>
  );
}
