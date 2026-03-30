/**
 * Replace Famous `src/components/services/FileClaim.tsx`.
 * Wire: submitClaim, uploadClaimPhotos from api (merge api.claims-extensions.ts).
 * Align `claims` table columns with your Supabase schema (rename fields below if needed).
 */

import React, { useEffect, useState } from "react";
import { AlertCircle, Camera, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { submitClaim } from "@/api";

type PolicyRow = {
  id: string;
  policy_number: string | null;
  segment: string;
  carrier?: string | null;
};

type Props = {
  onBack: () => void;
};

const LOSS_TYPES = [
  "Property Damage",
  "Bodily Injury",
  "Theft",
  "Other",
];

export default function FileClaim({ onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [policyId, setPolicyId] = useState<string>("");
  const [claimType, setClaimType] = useState(LOSS_TYPES[0]);
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [description, setDescription] = useState("");
  const [thirdParty, setThirdParty] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ claimNumber: string; backendOk: boolean; msg?: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("policies")
        .select("id, policy_number, segment, carrier")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const rows = (data || []) as PolicyRow[];
      setPolicies(rows);
      if (rows.length === 1) setPolicyId(rows[0].id);
      setLoading(false);
    })();
  }, []);

  const selected = policies.find((p) => p.id === policyId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!policyId || !incidentDate || !description.trim()) {
      setError("Select a policy and fill required fields.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitClaim({
        userId: user.id,
        policyId,
        segment: selected?.segment || "bar",
        policyNumber: selected?.policy_number,
        claimType,
        incidentDate,
        incidentLocation,
        description,
        thirdPartyInfo: thirdParty || null,
        photos,
      });
      setSuccess({
        claimNumber: result.claimNumber,
        backendOk: result.backendOk,
        msg: result.backendMessage,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  function onPhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    setPhotos((prev) => [...prev, ...list].slice(0, 5));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <h2 className="text-xl font-bold text-slate-900">Claim submitted</h2>
        <p className="text-slate-700">
          Claim number:{" "}
          <span className="font-mono font-semibold">{success.claimNumber}</span>
        </p>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 text-sm"
          onClick={() => navigator.clipboard.writeText(success.claimNumber)}
        >
          Copy number
        </button>
        {!success.backendOk && (
          <div className="flex gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>
              Saved in CID Connect. Backend notification had an issue — our team will still see your claim.
              {success.msg ? ` (${success.msg.slice(0, 120)}…)` : ""}
            </span>
          </div>
        )}
        <button
          type="button"
          className="mt-4 w-full rounded bg-orange-500 py-3 font-semibold text-white"
          onClick={onBack}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4 p-4">
      <button type="button" onClick={onBack} className="text-sm text-slate-500">
        ← Back
      </button>
      <h2 className="text-xl font-bold text-slate-900">File a claim</h2>

      {policies.length === 0 && (
        <div className="flex gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertCircle className="h-5 w-5" />
          No active policy found. Bind or add a policy first.
        </div>
      )}

      {policies.length > 0 && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Policy</span>
          <select
            className="mt-1 w-full rounded border border-slate-300 p-2"
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            required
          >
            <option value="">Select policy</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.policy_number || p.id} · {p.segment}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Type of loss</span>
        <select
          className="mt-1 w-full rounded border border-slate-300 p-2"
          value={claimType}
          onChange={(e) => setClaimType(e.target.value)}
        >
          {LOSS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Date of incident</span>
        <input
          type="date"
          className="mt-1 w-full rounded border border-slate-300 p-2"
          value={incidentDate}
          onChange={(e) => setIncidentDate(e.target.value)}
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Location</span>
        <input
          className="mt-1 w-full rounded border border-slate-300 p-2"
          value={incidentLocation}
          onChange={(e) => setIncidentLocation(e.target.value)}
          placeholder="City, site address, or description"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Description *</span>
        <textarea
          className="mt-1 min-h-[120px] w-full rounded border border-slate-300 p-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Third parties (optional)</span>
        <textarea
          className="mt-1 w-full rounded border border-slate-300 p-2"
          value={thirdParty}
          onChange={(e) => setThirdParty(e.target.value)}
        />
      </label>

      <div>
        <span className="text-sm font-medium text-slate-700">Photos (max 5)</span>
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded border border-dashed border-slate-300 p-4">
          <Camera className="h-6 w-6 text-slate-400" />
          <span className="text-sm text-slate-600">Tap to add photos</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotosChange} />
        </label>
        {photos.length > 0 && (
          <ul className="mt-2 text-sm text-slate-600">
            {photos.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="rounded bg-red-50 p-2 text-red-800">{error}</div>}

      <button
        type="submit"
        disabled={submitting || policies.length === 0}
        className="w-full rounded bg-orange-500 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit claim"}
      </button>
    </form>
  );
}
