/**
 * NEW: Replace static overview cards in AdminDashboard Overview tab
 * Requires: Realtime enabled on claims, coi_requests, policies (Supabase Dashboard → Replication)
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Point = { day: string; value: number };

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return null;
  const w = 80;
  const h = 24;
  const max = Math.max(1, ...points);
  const step = w / (points.length - 1 || 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function AdminOverviewLive() {
  const [claimsToday, setClaimsToday] = useState(0);
  const [coiToday, setCoiToday] = useState(0);
  const [policiesToday, setPoliciesToday] = useState(0);
  const [emailsToday, setEmailsToday] = useState(0);
  const [feed, setFeed] = useState<{ t: string; msg: string }[]>([]);
  const [series, setSeries] = useState<{ claims: Point[]; coi: Point[]; pol: Point[] }>({
    claims: [],
    coi: [],
    pol: [],
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  async function loadToday() {
    const iso = startOfToday.toISOString();
    const [c, o, p, a] = await Promise.all([
      supabase.from("claims").select("id", { count: "exact", head: true }).gte("created_at", iso),
      supabase
        .from("coi_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso)
        .eq("status", "completed"),
      supabase.from("policies").select("id", { count: "exact", head: true }).gte("created_at", iso),
      supabase
        .from("admin_audit_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso)
        .ilike("action", "%email%"),
    ]);
    setClaimsToday(c.count ?? 0);
    setCoiToday(o.count ?? 0);
    setPoliciesToday(p.count ?? 0);
    setEmailsToday(a.count ?? 0);
  }

  async function loadSparklines() {
    // Simplified: last 7 calendar days counts (implement day-bucketing in SQL for accuracy)
    const days = 7;
    const claims: Point[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d0 = new Date();
      d0.setDate(d0.getDate() - i);
      d0.setHours(0, 0, 0, 0);
      const d1 = new Date(d0);
      d1.setDate(d1.getDate() + 1);
      const { count } = await supabase
        .from("claims")
        .select("id", { count: "exact", head: true })
        .gte("created_at", d0.toISOString())
        .lt("created_at", d1.toISOString());
      claims.push({ day: d0.toISOString().slice(0, 10), value: count ?? 0 });
    }
    setSeries((s) => ({ ...s, claims }));
  }

  useEffect(() => {
    void loadToday();
    void loadSparklines();

    const ch = supabase
      .channel("admin-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims" },
        () => void loadToday(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coi_requests" },
        () => void loadToday(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "policies" },
        () => void loadToday(),
      )
      .subscribe();

    const id = window.setInterval(() => void loadToday(), 60_000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-6 p-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Today&apos;s summary</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Claims filed</p>
            <p className="text-2xl font-bold text-slate-900">{claimsToday}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">COIs completed</p>
            <p className="text-2xl font-bold text-slate-900">{coiToday}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Policies bound</p>
            <p className="text-2xl font-bold text-slate-900">{policiesToday}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Emails (audit)</p>
            <p className="text-2xl font-bold text-slate-900">{emailsToday}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-3">
          <span className="text-sm font-medium text-slate-700">Claims (7d)</span>
          <Sparkline points={series.claims.map((x) => x.value)} color="#ea580c" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">Live activity</h3>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm text-slate-600">
          {feed.length === 0 && <li className="text-slate-400">Subscribe to tables + append events…</li>}
          {feed.map((f, i) => (
            <li key={i}>
              {f.t} — {f.msg}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
