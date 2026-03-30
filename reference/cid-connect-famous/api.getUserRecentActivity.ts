/**
 * MERGE into Famous src/api.ts
 * Depends: supabase client, types below or inline
 */

import { supabase } from "@/lib/supabase";

export type ActivityKind = "claim" | "coi" | "policy";

export type ActivityItem = {
  kind: ActivityKind;
  id: string;
  reference: string;
  status: string | null;
  at: string;
  /** ISO timestamp for sorting */
  sortKey: number;
};

function ts(row: { created_at?: string | null; updated_at?: string | null }): number {
  const a = row.updated_at || row.created_at;
  return a ? new Date(a).getTime() : 0;
}

/**
 * Last 10 events for the user across claims, coi_requests, policies (parallel queries).
 */
export async function getUserRecentActivity(userId: string): Promise<ActivityItem[]> {
  const [claimsRes, coiRes, polRes] = await Promise.all([
    supabase
      .from("claims")
      .select("id, claim_number, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("coi_requests")
      .select("id, request_number, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("policies")
      .select("id, policy_number, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  if (claimsRes.error) throw claimsRes.error;
  if (coiRes.error) throw coiRes.error;
  if (polRes.error) throw polRes.error;

  const items: ActivityItem[] = [];

  for (const c of claimsRes.data ?? []) {
    const ref = (c as { claim_number?: string }).claim_number || (c as { id: string }).id;
    items.push({
      kind: "claim",
      id: (c as { id: string }).id,
      reference: ref,
      status: (c as { status?: string | null }).status ?? null,
      at: (c as { updated_at?: string; created_at?: string }).updated_at ||
        (c as { created_at?: string }).created_at ||
        "",
      sortKey: ts(c as { created_at?: string; updated_at?: string }),
    });
  }

  for (const r of coiRes.data ?? []) {
    const ref =
      (r as { request_number?: string }).request_number || (r as { id: string }).id;
    items.push({
      kind: "coi",
      id: (r as { id: string }).id,
      reference: ref,
      status: (r as { status?: string | null }).status ?? null,
      at: (r as { updated_at?: string; created_at?: string }).updated_at ||
        (r as { created_at?: string }).created_at ||
        "",
      sortKey: ts(r as { created_at?: string; updated_at?: string }),
    });
  }

  for (const p of polRes.data ?? []) {
    const ref =
      (p as { policy_number?: string }).policy_number || (p as { id: string }).id;
    items.push({
      kind: "policy",
      id: (p as { id: string }).id,
      reference: ref,
      status: (p as { status?: string | null }).status ?? null,
      at: (p as { updated_at?: string; created_at?: string }).updated_at ||
        (p as { created_at?: string }).created_at ||
        "",
      sortKey: ts(p as { created_at?: string; updated_at?: string }),
    });
  }

  items.sort((a, b) => b.sortKey - a.sortKey);
  return items.slice(0, 10);
}
