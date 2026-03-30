/**
 * NEW: src/components/services/ClaimDetail.tsx
 * Wire MainApp: serviceView 'claim-detail', state selectedClaim: Claim | null
 */

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ImageIcon } from "lucide-react";
import { getClaimPhotoUrl } from "@/api";
import type { Claim } from "@/types";

type Props = {
  claim: Claim;
  onBack: () => void;
};

function statusBadgeClass(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  if (s === "approved" || s === "closed") return "bg-emerald-100 text-emerald-800";
  if (s === "denied" || s === "failed") return "bg-red-100 text-red-800";
  if (s === "under_review" || s === "pending" || s === "processing")
    return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-800";
}

export default function ClaimDetail({ claim, onBack }: Props) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  const paths = Array.isArray(claim.photo_paths)
    ? claim.photo_paths
    : typeof claim.photo_paths === "string"
      ? [claim.photo_paths]
      : [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPhotos(true);
      const next: Record<string, string> = {};
      for (const p of paths) {
        if (!p || typeof p !== "string") continue;
        const url = await getClaimPhotoUrl(p);
        if (url) next[p] = url;
      }
      if (!cancelled) {
        setPhotoUrls(next);
        setLoadingPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claim.id, JSON.stringify(claim.photo_paths)]);

  const thirdParty =
    (claim as { third_party_name?: string }).third_party_name ||
    (claim as { third_party_contact?: string }).third_party_contact ||
    claim.third_party_info;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <span className="font-mono text-sm font-semibold text-slate-900">
          {claim.claim_number || claim.id}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(claim.status)}`}
        >
          {claim.status || "submitted"}
        </span>
      </div>

      <div className="space-y-6 p-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Incident</h3>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Type</dt>
              <dd className="text-right text-slate-900">{claim.claim_type || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Date</dt>
              <dd className="text-right text-slate-900">{claim.incident_date || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Location</dt>
              <dd className="text-right text-slate-900">{claim.incident_location || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-slate-900">
                {claim.description || "—"}
              </dd>
            </div>
          </dl>
        </section>

        {(thirdParty || claim.third_party_info) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
              Third party
            </h3>
            <dl className="space-y-1 text-sm text-slate-800">
              {(claim as { third_party_name?: string }).third_party_name && (
                <p>
                  <span className="text-slate-500">Name: </span>
                  {(claim as { third_party_name?: string }).third_party_name}
                </p>
              )}
              {(claim as { third_party_contact?: string }).third_party_contact && (
                <p>
                  <span className="text-slate-500">Contact: </span>
                  {(claim as { third_party_contact?: string }).third_party_contact}
                </p>
              )}
              {claim.third_party_info && (
                <p className="whitespace-pre-wrap">{claim.third_party_info}</p>
              )}
            </dl>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Amounts & adjuster</h3>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Estimated amount</dt>
              <dd className="text-right">
                {(claim as { estimated_amount?: number | null }).estimated_amount != null
                  ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
                      Number((claim as { estimated_amount?: number }).estimated_amount),
                    )
                  : "—"}
              </dd>
            </div>
            {(claim as { adjuster_name?: string }).adjuster_name && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Adjuster</dt>
                <dd className="text-right">{(claim as { adjuster_name?: string }).adjuster_name}</dd>
              </div>
            )}
            {(claim as { adjuster_email?: string }).adjuster_email && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Adjuster email</dt>
                <dd className="text-right break-all">
                  {(claim as { adjuster_email?: string }).adjuster_email}
                </dd>
              </div>
            )}
            {(claim as { adjuster_phone?: string }).adjuster_phone && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Adjuster phone</dt>
                <dd className="text-right">{(claim as { adjuster_phone?: string }).adjuster_phone}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <ImageIcon className="h-3 w-3" />
            Photos ({paths.length})
          </h3>
          {loadingPhotos ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : paths.length === 0 ? (
            <p className="text-sm text-slate-500">No photos uploaded</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {paths.map((path) => (
                <a
                  key={path}
                  href={photoUrls[path] || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                >
                  {photoUrls[path] ? (
                    <img
                      src={photoUrls[path]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-slate-400">
                      Unavailable
                    </span>
                  )}
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Timeline</h3>
          <ul className="space-y-3 border-l-2 border-slate-200 pl-4 text-sm">
            <li className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-orange-500" />
              <p className="font-medium text-slate-900">Created</p>
              <p className="text-slate-500">
                {claim.created_at ? new Date(claim.created_at).toLocaleString() : "—"}
              </p>
            </li>
            <li className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
              <p className="font-medium text-slate-900">Last updated</p>
              <p className="text-slate-500">
                {claim.updated_at ? new Date(claim.updated_at).toLocaleString() : "—"}
              </p>
              <p className="text-slate-700">Status: {claim.status || "—"}</p>
            </li>
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Fine-grained status history requires a history table; this shows created and last
            update from the claim row.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Backend</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Notified</dt>
              <dd>{claim.backend_notified ? "Yes" : "No"}</dd>
            </div>
            {claim.backend_response && (
              <div>
                <dt className="text-slate-500">Response</dt>
                <dd className="mt-1 rounded bg-slate-100 p-2 font-mono text-xs break-all text-slate-800">
                  {claim.backend_response}
                </dd>
              </div>
            )}
            {claim.segment && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Segment</dt>
                <dd className="capitalize">{claim.segment}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
