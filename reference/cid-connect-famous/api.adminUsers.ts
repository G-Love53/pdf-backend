/**
 * MERGE into api.ts — User Management tab
 * Requires profiles: id, email, full_name, role, created_at
 */

import { supabase } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
};

export async function getAllProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateUserRole(userId: string, newRole: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
  if (error) throw error;
}
