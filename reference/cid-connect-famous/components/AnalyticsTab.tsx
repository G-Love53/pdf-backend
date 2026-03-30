/**
 * NEW: src/components/admin/AnalyticsTab.tsx
 * Import in AdminDashboard as 4th tab; uses getAnalyticsData + AnalyticsData from @/api
 */

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAnalyticsData, type AnalyticsData } from "@/api";

function WeeklyBarBlock({
  title,
  points,
  labelKey,
}: {
  title: string;
  points: { label: string; count: number }[];
  labelKey: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="flex h-48 items-end gap-1 border-b border-slate-200 pb-8">
        {points.length === 0 ? (
          <p className="text-sm text-slate-500">No data in range</p>
        ) : (
          points.map((p) => (
            <div
              key={`${labelKey}-${p.label}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className="w-full max-w-[2rem] rounded-t bg-orange-500 transition-all"
                style={{
                  height: `${Math.max(4, (p.count / max) * 100)}%`,
                  minHeight: p.count > 0 ? "4px" : "0",
                }}
                title={`${p.label}: ${p.count}`}
              />
            </div>
          ))
        )}
      </div>
      <div className="-mt-6 flex gap-1">
        {points.map((p) => (
          <div
            key={`${labelKey}-x-${p.label}`}
            className="flex min-w-0 flex-1 flex-col items-center"
          >
            <span className="truncate text-[10px] text-slate-500">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyBarBlock({
  title,
  points,
  labelKey,
}: {
  title: string;
  points: { label: string; count: number }[];
  labelKey: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="flex h-48 items-end gap-2 border-b border-slate-200 pb-8">
        {points.length === 0 ? (
          <p className="text-sm text-slate-500">No data in range</p>
        ) : (
          points.map((p) => (
            <div
              key={`${labelKey}-${p.label}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className="w-full rounded-t bg-slate-700 transition-all"
                style={{
                  height: `${Math.max(4, (p.count / max) * 100)}%`,
                  minHeight: p.count > 0 ? "4px" : "0",
                }}
                title={`${p.label}: ${p.count}`}
              />
            </div>
          ))
        )}
      </div>
      <div className="-mt-6 flex gap-2">
        {points.map((p) => (
          <div
            key={`${labelKey}-x-${p.label}`}
            className="flex min-w-0 flex-1 flex-col items-center"
          >
            <span className="truncate text-[10px] text-slate-500">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "N/A";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await getAnalyticsData();
        if (!cancelled) setData(d);
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load analytics");
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

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!data) return null;

  type Pt = { weekLabel?: string; week?: string; monthLabel?: string; month?: string; count?: number };
  const d = data as AnalyticsData & Record<string, unknown>;
  const claimsWeek = ((d.claimsPerWeek ?? []) as Pt[]).map((w) => ({
    label: w.weekLabel ?? w.week ?? "",
    count: w.count ?? 0,
  }));
  const coiWeek = ((d.coiPerWeek ?? []) as Pt[]).map((w) => ({
    label: w.weekLabel ?? w.week ?? "",
    count: w.count ?? 0,
  }));
  const bindsMonth = ((d.policyBindsPerMonth ?? []) as Pt[]).map((m) => ({
    label: m.monthLabel ?? m.month ?? "",
    count: m.count ?? 0,
  }));

  return (
    <div className="space-y-8 p-2">
      <div className="grid gap-6 lg:grid-cols-1">
        <WeeklyBarBlock
          title="Claims filed per week"
          points={claimsWeek}
          labelKey="cw"
        />
        <WeeklyBarBlock
          title="COI requests per week"
          points={coiWeek}
          labelKey="coiw"
        />
        <MonthlyBarBlock
          title="Policy binds per month"
          points={bindsMonth}
          labelKey="pm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Total premium volume</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(data.totalPremiumVolume)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Average claim amount (est.)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {data.averageClaimAmount != null && !Number.isNaN(data.averageClaimAmount)
              ? formatMoney(data.averageClaimAmount)
              : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Total claims with amounts</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {data.totalClaimsWithAmounts ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Total estimated (claims)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(data.totalClaimAmount)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Total settled (payouts)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {(data as AnalyticsData & { totalSettledAmount?: number }).totalSettledAmount != null
              ? formatMoney((data as AnalyticsData & { totalSettledAmount?: number }).totalSettledAmount)
              : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Claims with settlement</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {(data as AnalyticsData & { totalClaimsWithSettlement?: number }).totalClaimsWithSettlement ??
              0}
          </p>
        </div>
      </div>
    </div>
  );
}
