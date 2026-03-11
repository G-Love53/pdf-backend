import { getPool, recordSubmission } from "../src/db.js";

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL not configured; cannot seed.");
    process.exit(1);
  }

  try {
    // 1) Create a fake submission via existing helper
    const submission = await recordSubmission({
      segment: "bar",
      sourceDomain: "local-seed",
      sourceForm: "seed-s4-test",
      rawSubmission: {
        business_name: "Seed Bar S4 Test",
        contact_email: "seed-s4@example.com",
      },
      primaryEmail: "seed-s4@example.com",
      primaryPhone: null,
      firstName: "Seed",
      lastName: "Operator",
    });

    if (!submission) {
      console.error("recordSubmission failed; aborting.");
      process.exit(1);
    }

    const { submissionId, submissionPublicId } = submission;
    console.log("Created submission:", submissionPublicId, submissionId);

    // 2) Minimal carrier_message
    const carrierRes = await pool.query(
      `
        INSERT INTO carrier_messages (
          submission_id,
          segment,
          direction,
          carrier_name,
          from_email,
          to_email,
          subject,
          body_text,
          received_at
        )
        VALUES ($1,'bar','inbound','SeedCarrier',
                'underwriting@example.com',
                'quotes@barinsurancedirect.com',
                $2,
                'Seed S4 test message body',
                NOW())
        RETURNING carrier_message_id
      `,
      [
        submissionId,
        `Re: [${submissionPublicId}] GL Quote Request - Seed Bar S4 Test`,
      ],
    );

    const carrierMessageId = carrierRes.rows[0].carrier_message_id;
    console.log("Created carrier_message:", carrierMessageId);

    // 3) Quote
    const quoteRes = await pool.query(
      `
        INSERT INTO quotes (
          submission_id,
          carrier_message_id,
          carrier_name,
          segment,
          status,
          match_confidence,
          match_status,
          match_method,
          match_details_json
        )
        VALUES ($1,$2,'SeedCarrier','bar',
                'received',0.95,'auto_matched','subject_id',
                '{"seed":true}')
        RETURNING quote_id
      `,
      [submissionId, carrierMessageId],
    );

    const quoteId = quoteRes.rows[0].quote_id;
    console.log("Created quote:", quoteId);

    // 4) Document row pointing at a fake R2 path
    const docRes = await pool.query(
      `
        INSERT INTO documents (
          client_id,
          submission_id,
          quote_id,
          policy_id,
          document_type,
          document_role,
          storage_provider,
          storage_path,
          mime_type,
          sha256_hash,
          is_original,
          created_by
        )
        VALUES (
          NULL,
          $1,
          $2,
          NULL,
          'pdf',
          'carrier_quote_original',
          'r2',
          'incoming/bar/seed-s4-test/seed-quote.pdf',
          'application/pdf',
          '0000000000000000000000000000000000000000000000000000000000000000',
          TRUE,
          'carrier'
        )
        RETURNING document_id
      `,
      [submissionId, quoteId],
    );

    const documentId = docRes.rows[0].document_id;
    console.log("Created document:", documentId);

    // 5) Work queue item for S4
    const wqRes = await pool.query(
      `
        INSERT INTO work_queue_items (
          queue_type,
          related_entity_type,
          related_entity_id,
          priority,
          reason_code,
          reason_detail,
          status
        )
        VALUES (
          'extraction_review',
          'quote',
          $1,
          3,
          'seed_s4_test',
          'Seeded S4 extraction review item for local testing.',
          'open'
        )
        RETURNING work_queue_item_id
      `,
      [quoteId],
    );

    const workQueueItemId = wqRes.rows[0].work_queue_item_id;
    console.log("Created work_queue_item (S4):", workQueueItemId);

    console.log("\nSeed complete.");
    console.log("Open: http://localhost:8080/operator/extraction-review");
  } catch (err) {
    console.error("Seed error:", err.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

