/**
 * Embed in ServicesScreen.tsx — replace static "No recent activity"
 * Parent must pass: onNavigateActivity(item) to set MainApp view + state
 */

import React, { useEffect, useState } from "react";
import { FileText, Shield, ClipboardList, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getUserRecentActivity, type ActivityItem } from "@/api";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

type Props = {
  onNavigateActivity: (item: ActivityItem) => void | Promise<void>;
};

function iconFor(kind: ActivityItem["kind"]) {
  if (kind === "claim") return ClipboardList;
  if (kind === "coi") return FileText;
  return Shield;
}

function badgeClass(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "approved" || s === "active") return "bg-emerald-100 text-emerald-800";
  if (s === "failed" || s === "denied") return "bg-red-100 text-red-800";
  if (s === "processing" || s === "pending" || s === "under_review") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-800";
}

export default function ServicesActivityFeed({ onNavigateActivity }: Props) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const rows = await getUserRecentActivity(user.id);
        if (!cancelled) setItems(rows);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load activity");
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
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (err) {
    return <p className="text-sm text-red-600">{err}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No recent activity yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = iconFor(item.kind);
        const label =
          item.kind === "claim" ? "Claim" : item.kind === "coi" ? "COI" : "Policy";
        return (
          <li key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              onClick={() => void onNavigateActivity(item)}
              className="flex w-full items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-200"
            >
              <span className="mt-0.5 rounded-full bg-orange-50 p-2 text-orange-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-xs font-medium uppercase text-slate-500">{label}</span>
                <p className="font-mono text-sm font-semibold text-slate-900">{item.reference}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badgeClass(item.status)}`}
                  >
                    {item.status || "—"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatRelativeTime(item.at)}
                  </span>
                </div>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
