/**
 * MERGE into send-notification/index.ts — after parsing body, before buildEmailContent:
 *
 * 1) Create Supabase client with SUPABASE_SERVICE_ROLE_KEY
 * 2) Query: .from('email_templates').select('*')
 *      .eq('entity_type', entity_type)
 *      .eq('status_trigger', new_status.toLowerCase())
 *      .eq('is_active', true)
 *      .maybeSingle()
 * 3) If row: interpolate subject_template + body_template with:
 *    {{reference_number}}, {{user_email}}, {{extra_context}}, {{extra_context_html}}
 *    (escape HTML for extra_context in body if template is HTML)
 * 4) If no row: call existing buildEmailContent() as today
 *
 * Interpolation helper:
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
 */

export {};
