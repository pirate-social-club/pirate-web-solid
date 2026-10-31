import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const hash = value => createHash("sha256").update(value).digest("hex");
export function object(value) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value;
}
export function exactKeys(value, keys) { assert.deepEqual(Object.keys(object(value)).sort(), [...keys].sort()); }
export function accepted(value) {
  assert.equal(value.accepted, true); assert.equal(value.reviewer_role, "independent_reviewer"); assert.deepEqual(value.findings, []);
}
export function digestString(value) { assert.match(value ?? "", /^[a-f0-9]{64}$/u); return value; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const digest = value => hash(JSON.stringify(canonical(value)));
export function candidateIdentity(candidate) {
  return { source: candidate.source, artifact_sha256: candidate.artifact_sha256, receipt_sha256: candidate.receipt_sha256,
    config_sha256: candidate.config_sha256, modules_sha256: candidate.modules_sha256, client_sha256: candidate.client_sha256,
    uploader_sha256: candidate.uploader_sha256 };
}
export function validateModules(modules, expected) {
  assert.ok(Array.isArray(modules) && modules.length === expected.length);
  const known = new Map(expected.map(row => [row.name, row])); const seen = new Set();
  const safe = modules.map(row => {
    assert.ok(typeof row.name === "string" && known.has(row.name) && !seen.has(row.name), "Unexpected/duplicate provider module"); seen.add(row.name);
    assert.equal(row.content_type, "application/javascript+module", "Provider module type differs");
    assert.ok(typeof row.content_base64 === "string");
    const bytes = Buffer.from(row.content_base64, "base64"); assert.equal(bytes.toString("base64"), row.content_base64);
    const anticipated = known.get(row.name); assert.equal(hash(bytes), anticipated.sha256); assert.equal(bytes.length, anticipated.bytes);
    return { name: row.name, sha256: hash(bytes), bytes: bytes.length };
  });
  return safe.sort((a, b) => a.name.localeCompare(b.name));
}
export function validateAttemptIdentity(attempt, expected, executorAccepted) {
  assert.equal(attempt.kind, "ordinary-website-upload-attempt-v1");
  assert.deepEqual(attempt.candidate_identity, expected); assert.equal(executorAccepted, true);
  digestString(attempt.before_sha256); digestString(attempt.review_sha256);
}
export function validateReadbackIdentity(readback, attemptSha, candidate, executorAccepted) {
  assert.equal(readback.kind, "ordinary-website-upload-readback-v1"); assert.equal(readback.accepted, true);
  assert.equal(readback.attempt_sha256, attemptSha); assert.deepEqual(readback.candidate_identity, candidate);
  assert.equal(executorAccepted, true); assert.equal(readback.after.candidate_verified, true);
}
export function validateCommandLineage(receipt, attemptSha, executorAccepted) {
  assert.equal(receipt.kind, "ordinary-website-deployment-command-result-v1");
  assert.equal(receipt.attempt_sha256, attemptSha); assert.equal(executorAccepted, true);
  assert.ok(Number.isInteger(receipt.exit_code) && receipt.exit_code >= 0 && receipt.exit_code <= 255);
  digestString(receipt.stdout_sha256); digestString(receipt.stderr_sha256);
  assert.equal(receipt.provider_output_emitted, false);
}
