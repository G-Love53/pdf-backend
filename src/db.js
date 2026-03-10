import pg from "pg";

const { Pool } = pg;

let pool = null;

function createPool() {
  if (!process.env.DATABASE_URL) {
    console.warn("[db] DATABASE_URL not set; DB features disabled.");
    return null;
  }

  const config = {
    connectionString: process.env.DATABASE_URL,
  };

  // Render Postgres usually requires SSL; allow opt-out via PGSSLMODE=disable
  if (process.env.PGSSLMODE !== "disable") {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

export function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

/**
 * Record a submission in the CID schema:
 * - Upsert client by primary_email
 * - Generate submission_public_id
 * - Insert submissions row
 * - Append submission.received timeline_event
 *
 * Returns { clientId, submissionId, submissionPublicId } or null on failure.
 */
export async function recordSubmission({
  segment,
  sourceDomain,
  sourceForm,
  rawSubmission,
  primaryEmail,
  primaryPhone,
  firstName,
  lastName,
}) {
  const poolInstance = getPool();
  if (!poolInstance) return null;
  if (!primaryEmail) return null;

  const client = await poolInstance.connect();
  try {
    await client.query("BEGIN");

    const clientRes = await client.query(
      `
        INSERT INTO clients (primary_email, primary_phone, first_name, last_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (primary_email)
        DO UPDATE SET
          primary_phone = COALESCE(EXCLUDED.primary_phone, clients.primary_phone),
          updated_at    = NOW()
        RETURNING client_id
      `,
      [primaryEmail, primaryPhone || null, firstName || null, lastName || null],
    );

    const clientId = clientRes.rows[0]?.client_id;
    if (!clientId) {
      await client.query("ROLLBACK");
      return null;
    }

    const seg = (segment || "bar").toLowerCase();
    const segEnum = seg === "bar" || seg === "roofer" || seg === "plumber" || seg === "hvac" ? seg : "bar";

    const idRes = await client.query(
      `SELECT generate_submission_public_id($1::segment_type) AS id`,
      [segEnum],
    );
    const submissionPublicId = idRes.rows[0]?.id;
    if (!submissionPublicId) {
      await client.query("ROLLBACK");
      return null;
    }

    const subRes = await client.query(
      `
        INSERT INTO submissions (
          submission_public_id,
          client_id,
          segment,
          source_domain,
          source_form,
          raw_submission_json,
          status
        )
        VALUES ($1, $2, $3::segment_type, $4, $5, $6, 'received')
        RETURNING submission_id
      `,
      [
        submissionPublicId,
        clientId,
        segEnum,
        sourceDomain || "unknown",
        sourceForm || null,
        rawSubmission,
      ],
    );

    const submissionId = subRes.rows[0]?.submission_id;
    if (!submissionId) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
        INSERT INTO timeline_events (
          client_id,
          submission_id,
          event_type,
          event_label,
          event_payload_json,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        clientId,
        submissionId,
        "submission.received",
        "Submission received from form endpoint",
        rawSubmission,
        "system",
      ],
    );

    await client.query("COMMIT");
    return { clientId, submissionId, submissionPublicId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[db] recordSubmission error:", err.message || err);
    return null;
  } finally {
    client.release();
  }
}

// src/db.js

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
// CRITICAL: Use the Service Role Key for server-side security
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn("⚠️ Supabase credentials missing. Database features will not work.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to save the initial AI-analyzed quote data
export async function saveQuoteToDb(data) {
  const { error } = await supabase
    .from('quotes')
    .insert([data]);
    
  if (error) {
    console.error("❌ DB Save Failed:", error);
    throw error;
  }
  console.log(`✅ Quote ${data.quote_id} saved to Supabase.`);
}
/**
 * Uploads educational materials to the Knowledge Hub
 * @param {string} carrierName - e.g., 'Travelers'
 * @param {string} segment - e.g., 'Plumber'
 * @param {string} type - 'Marketing' | 'Definitions' | 'Step-by-Step Guides' | 'Forms' | 'Training'
 * @param {string} title - The display name of the PDF
 * @param {Buffer} fileBuffer - The PDF file data
 */
export async function uploadCarrierResource(carrierName, segment, type, title, fileBuffer) {
  const fileName = `${title.replace(/\s+/g, '_').toLowerCase()}.pdf`;
  const path = `carrier-resources/${carrierName}/${segment}/${type}/${fileName}`;

  // 1. Upload to the secure storage bucket
  const { data: upload, error: uploadErr } = await supabase.storage
    .from('cid-docs')
    .upload(path, fileBuffer, { 
      contentType: 'application/pdf',
      upsert: true // Allows robots to update documents if they change
    });

  if (uploadErr) throw uploadErr;

  // 2. Index in the database table so the App can find it
  const { error: dbErr } = await supabase
    .from('carrier_resources')
    .insert([{
      carrier_name: carrierName,
      segment: segment,
      resource_type: type,
      title: title,
      file_path: path
    }]);

  if (dbErr) throw dbErr;
}


