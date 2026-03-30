/**
 * MERGE into api.ts — Admin Templates tab CRUD
 */

import { supabase } from "@/lib/supabase";

export type EmailTemplateRow = {
  id: string;
  entity_type: string;
  status_trigger: string;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .order("entity_type", { ascending: true })
    .order("status_trigger", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EmailTemplateRow[];
}

export async function upsertEmailTemplate(row: Partial<EmailTemplateRow> & { id?: string }) {
  const { error } = await supabase.from("email_templates").upsert(row, {
    onConflict: "entity_type,status_trigger",
  });
  if (error) throw error;
}

export async function deleteEmailTemplate(id: string) {
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw error;
}

/** Preview: replace {{tokens}} with sample data */
export function previewTemplate(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
