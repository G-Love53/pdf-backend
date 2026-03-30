/**
 * MERGE into api.ts — call logAdminAction after successful admin mutations.
 * Table must include admin_email (denormalized) per migration admin_audit_log.sql
 */

import { supabase } from "@/lib/supabase";

export type AdminAuditInput = {
  action: string;
  entity_type: "claim" | "coi_request" | "policy" | "other" | string;
  entity_id?: string | null;
  entity_reference?: string | null;
  old_value?: unknown;
  new_value?: unknown;
};

export async function logAdminAction(input: AdminAuditInput): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let admin_email: string | null = null;
  const { data: prof } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
  if (prof && typeof (prof as { email?: string }).email === "string") {
    admin_email = (prof as { email: string }).email;
  }

  const { error } = await supabase.from("admin_audit_log").insert({
    admin_user_id: user.id,
    admin_email,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    entity_reference: input.entity_reference ?? null,
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
  });

  if (error) console.warn("logAdminAction", error.message);
}

export type AuditLogRow = {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_reference: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export async function getRecentAuditLogs(opts: {
  limit?: number;
  action?: string | null;
  entity_type?: string | null;
}): Promise<AuditLogRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);

  let q = supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.action) q = q.eq("action", opts.action);
  if (opts.entity_type) q = q.eq("entity_type", opts.entity_type);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}
