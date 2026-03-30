/**
 * NEW: Admin tab "Users" — searchable table, role dropdown, stats
 * Calls getAllProfiles, updateUserRole, logAdminAction on role change
 */

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { getAllProfiles, updateUserRole, logAdminAction, type ProfileRow } from "@/api";

const ROLES = ["agent", "staff", "admin"] as const;

export default function AdminUsersTab() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await getAllProfiles();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(s) ||
        (r.full_name || "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const stats = useMemo(() => {
    const total = rows.length;
    const agents = rows.filter((r) => (r.role || "").toLowerCase() === "agent").length;
    const staff = rows.filter((r) => (r.role || "").toLowerCase() === "staff").length;
    const admins = rows.filter((r) => (r.role || "").toLowerCase() === "admin").length;
    return { total, agents, staff, admins };
  }, [rows]);

  async function onRoleChange(userId: string, oldRole: string | null, newRole: string) {
    if (!window.confirm(`Change role from ${oldRole} to ${newRole}?`)) return;
    await updateUserRole(userId, newRole);
    void logAdminAction({
      action: "user_role_change",
      entity_type: "user",
      entity_id: userId,
      entity_reference: userId,
      old_value: { role: oldRole },
      new_value: { role: newRole },
    });
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <span>Total: <strong>{stats.total}</strong></span>
        <span>Agents: <strong>{stats.agents}</strong></span>
        <span>Staff: <strong>{stats.staff}</strong></span>
        <span>Admins: <strong>{stats.admins}</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-slate-500" />
        <input
          type="search"
          placeholder="Search email or name…"
          className="max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-3 py-2">{r.full_name}</td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border border-slate-300 p-1 text-xs"
                    value={(r.role || "agent").toLowerCase()}
                    onChange={(e) => void onRoleChange(r.id, r.role, e.target.value)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
