/**
 * Local check for GUARD doc ingest. No production secrets, no GUARD API, no bind.
 * Role pick, content-hash idempotency, missing fileContent, mocked store.
 */
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import {
  DocumentRole,
} from "../src/constants/postgresEnums.js";
import {
  attachPendingGuardDocs,
  decodeGuardFileContent,
  guardDocumentRoleFromFileName,
  processGuardDocWebhook,
} from "../src/services/guardDocIngestService.js";

function pdfBuffer(token) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/CID(${token})>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    "utf8",
  );
}

function createMemoryDb() {
  const policies = [];
  const documents = [];
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (
        text === "begin" ||
        text === "commit" ||
        text === "rollback" ||
        text.startsWith("savepoint") ||
        text.startsWith("release savepoint") ||
        text.startsWith("rollback to savepoint")
      ) {
        return { rows: [] };
      }
      if (text.startsWith("select") && text.includes("from policies p")) {
        const num = params[0];
        const row = policies.find(
          (p) =>
            p.policy_number === num ||
            p.coverage_data?.guard_policy_number === num,
        );
        return { rows: row ? [row] : [] };
      }
      if (text.includes("sha256_hash") && text.includes("from documents")) {
        const [hash, likePattern, num] = params;
        const prefix = String(likePattern).replace(/\\/g, "").replace(/%$/, "");
        const row = documents.find((d) => {
          if (d.sha256_hash !== hash) return false;
          if (String(d.storage_path).startsWith(prefix)) return true;
          const policy = policies.find((p) => p.id === d.policy_id);
          return (
            policy &&
            (policy.policy_number === num ||
              policy.coverage_data?.guard_policy_number === num)
          );
        });
        return {
          rows: row
            ? [
                {
                  document_id: row.document_id,
                  policy_id: row.policy_id,
                  document_role: row.document_role,
                },
              ]
            : [],
        };
      }
      if (text.startsWith("insert into documents")) {
        const id = crypto.randomUUID();
        documents.push({
          document_id: id,
          client_id: params[0],
          submission_id: params[1],
          quote_id: params[2],
          policy_id: params[3],
          document_type: params[4],
          document_role: params[5],
          storage_provider: params[6],
          storage_path: params[7],
          mime_type: params[8],
          sha256_hash: params[9],
        });
        return { rows: [{ document_id: id }] };
      }
      if (text.startsWith("update documents")) {
        const [policyId, clientId, submissionId, quoteId, likePattern] = params;
        const prefix = String(likePattern).replace(/\\/g, "").replace(/%$/, "");
        const updated = [];
        for (const doc of documents) {
          if (doc.policy_id == null && String(doc.storage_path).startsWith(prefix)) {
            doc.policy_id = policyId;
            doc.client_id = doc.client_id || clientId;
            doc.submission_id = doc.submission_id || submissionId;
            doc.quote_id = doc.quote_id || quoteId;
            updated.push(doc.document_id);
          }
        }
        return { rows: updated.map((document_id) => ({ document_id })) };
      }
      throw new Error(`unexpected sql: ${text.slice(0, 200)}`);
    },
    release() {},
  };
  return {
    policies,
    documents,
    pool: { connect: async () => client },
    client,
  };
}

function depsFor(db, uploads) {
  return {
    getPool: () => db.pool,
    uploadBuffer: async (path, buffer, contentType) => {
      assert.equal(contentType, "application/pdf");
      assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0);
      assert.equal(buffer.includes(Buffer.from("fileContent")), false);
      uploads.push({ path, bytes: buffer.length });
      return path;
    },
    deleteObject: async () => {},
  };
}

async function checkRoles() {
  assert.equal(
    guardDocumentRoleFromFileName("GUARD-Proposal.pdf"),
    DocumentRole.CARRIER_QUOTE_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName("quote proposal.PDF"),
    DocumentRole.CARRIER_QUOTE_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName("Declarations.pdf"),
    DocumentRole.DECLARATIONS_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName("policy-dec.pdf"),
    DocumentRole.DECLARATIONS_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName("WC_DEC_PAGE.pdf"),
    DocumentRole.DECLARATIONS_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName("Issued-Policy.pdf"),
    DocumentRole.POLICY_ORIGINAL,
  );
  assert.equal(
    guardDocumentRoleFromFileName(""),
    DocumentRole.POLICY_ORIGINAL,
  );
}

async function checkMissingFileDoesNotThrow() {
  let poolCalled = false;
  const result = await processGuardDocWebhook(
    { policyNumber: "CIWCCHECK1", fileName: "Issued-Policy.pdf" },
    {
      getPool: () => {
        poolCalled = true;
        throw new Error("pool should not be used");
      },
      uploadBuffer: async () => {
        throw new Error("upload should not be used");
      },
    },
  );
  assert.equal(result.received, true);
  assert.equal(result.saved, false);
  assert.equal(result.pending, false);
  assert.equal(result.duplicate, false);
  assert.equal(result.error, "missing_file");
  assert.equal(poolCalled, false);
  assert.equal(decodeGuardFileContent(undefined).error, "missing_file");
  assert.equal(decodeGuardFileContent("@@@").error, "invalid_base64");
}

async function checkStoreAndIdempotency() {
  const db = createMemoryDb();
  const uploads = [];
  const deps = depsFor(db, uploads);
  const policyNumber = "CIWCCHECK1";
  const proposalPdf = pdfBuffer("proposal");
  const issuedPdf = pdfBuffer("issued");

  const proposal = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "GUARD-Proposal.pdf",
      fileType: "pdf",
      fileSize: proposalPdf.length,
      fileContent: proposalPdf.toString("base64"),
    },
    deps,
  );
  assert.equal(proposal.saved, true);
  assert.equal(proposal.pending, true);
  assert.equal(proposal.duplicate, false);
  assert.equal(proposal.policy_id, null);
  assert.equal(proposal.document_role, DocumentRole.CARRIER_QUOTE_ORIGINAL);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, /^guard\/pending\/CIWCCHECK1\//);
  assert.equal(db.documents.length, 1);
  assert.equal(db.documents[0].policy_id, null);
  assert.equal(db.documents[0].client_id, null);

  const again = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "GUARD-Proposal.pdf",
      fileContent: proposalPdf.toString("base64"),
    },
    deps,
  );
  assert.equal(again.duplicate, true);
  assert.equal(again.saved, false);
  assert.equal(again.pending, true);
  assert.equal(again.document_id, proposal.document_id);
  assert.equal(uploads.length, 1);
  assert.equal(db.documents.length, 1);

  const issued = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "Issued-Policy.pdf",
      fileContent: issuedPdf.toString("base64"),
    },
    deps,
  );
  assert.equal(issued.saved, true);
  assert.equal(issued.duplicate, false);
  assert.equal(issued.pending, true);
  assert.equal(issued.document_role, DocumentRole.POLICY_ORIGINAL);
  assert.equal(db.documents.length, 2);
  assert.notEqual(db.documents[0].sha256_hash, db.documents[1].sha256_hash);

  const dec = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "policy-dec.pdf",
      fileContent: pdfBuffer("dec").toString("base64"),
    },
    deps,
  );
  assert.equal(dec.document_role, DocumentRole.DECLARATIONS_ORIGINAL);
  assert.equal(dec.pending, true);

  const policyId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const quoteId = crypto.randomUUID();
  db.policies.push({
    id: policyId,
    policy_number: policyNumber,
    client_id: clientId,
    submission_id: submissionId,
    quote_id: quoteId,
    segment: "beauty",
    submission_public_id: "CID-BTY-CHECK",
    coverage_data: { guard_policy_number: policyNumber },
  });

  const attached = await attachPendingGuardDocs(db.client, {
    policyId,
    policyNumber,
    clientId,
    submissionId,
    quoteId,
  });
  assert.equal(attached.length, 3);
  for (const doc of db.documents) {
    assert.equal(doc.policy_id, policyId);
    assert.equal(doc.client_id, clientId);
    assert.equal(doc.quote_id, quoteId);
    assert.equal(doc.submission_id, submissionId);
  }

  const duplicateAfterBind = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "Issued-Policy.pdf",
      fileContent: issuedPdf.toString("base64"),
    },
    deps,
  );
  assert.equal(duplicateAfterBind.duplicate, true);
  assert.equal(duplicateAfterBind.pending, false);
  assert.equal(duplicateAfterBind.policy_id, policyId);
  assert.equal(uploads.length, 3);

  const direct = await processGuardDocWebhook(
    {
      policyNumber,
      fileName: "Declarations.pdf",
      fileContent: pdfBuffer("full-dec").toString("base64"),
    },
    deps,
  );
  assert.equal(direct.saved, true);
  assert.equal(direct.pending, false);
  assert.equal(direct.policy_id, policyId);
  assert.equal(direct.document_role, DocumentRole.DECLARATIONS_ORIGINAL);
  assert.match(uploads.at(-1).path, /^guard\/beauty\/CID-BTY-CHECK\/CIWCCHECK1\//);
  const directRow = db.documents.find((d) => d.document_id === direct.document_id);
  assert.equal(directRow.policy_id, policyId);
  assert.equal(directRow.quote_id, quoteId);
  assert.equal(directRow.client_id, clientId);
}

async function checkHandler() {
  if (!process.env.GUARD_WEBHOOK_AUTH) {
    process.env.GUARD_WEBHOOK_AUTH = "guard-doc-ingest-check";
  }
  const { default: router } = await import("../src/routes/webhooks.js");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(router);
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const port = server.address().port;
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/webhooks/guard-docs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: process.env.GUARD_WEBHOOK_AUTH,
      },
      body: JSON.stringify({
        policyNumber: "CIWCCHECK1",
        fileName: "Issued-Policy.pdf",
      }),
    });
    const missingBody = await missing.json();
    assert.equal(missing.status, 200);
    assert.equal(missingBody.ok, true);
    assert.equal(missingBody.saved, false);
    assert.equal(missingBody.error, "missing_file");
    assert.equal(Object.hasOwn(missingBody, "fileContent"), false);

    const denied = await fetch(`http://127.0.0.1:${port}/webhooks/guard-docs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "not-the-guard-secret",
      },
      body: JSON.stringify({ policyNumber: "CIWCCHECK1", fileName: "a.pdf" }),
    });
    assert.equal(denied.status, 401);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.ok, false);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

await checkRoles();
await checkMissingFileDoesNotThrow();
await checkStoreAndIdempotency();
await checkHandler();
console.log("guard doc ingest check ok");
