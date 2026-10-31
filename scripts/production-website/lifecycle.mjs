import assert from "node:assert/strict";
import { accepted, digest, digestString } from "./contract.mjs";

export function nextWebsiteNames(predecessorSha) {
  if (predecessorSha !== undefined) digestString(predecessorSha);
  const key = predecessorSha ? "website-" + predecessorSha : "website";
  return { key, attempt: key + "-upload-attempt.json", readback: key + "-readback.json", command: key + "-command-result.json" };
}
export function validateContinuation(continuation, predecessorSha, conclusion) {
  accepted(continuation); assert.equal(continuation.predecessor_attempt_sha256, predecessorSha);
  assert.equal(conclusion, "baseline_unchanged", "Website continuation requires reviewed unchanged baseline");
}
export function validateWebsiteBinding(proposal, reviewed) {
  for (const key of ["baseline_version", "baseline_sha256", "candidate_sha256", "settings_sha256", "candidate_settings_sha256", "changes"])
    assert.deepEqual(proposal[key], reviewed[key], "Website binding review differs: " + key);
}
export function validateProbeSelection(previous, selected, resolution) {
  if (digest(selected) === digest(previous)) return;
  assert.equal(resolution?.conclusion, "candidate_verified", "Changed probe metadata needs reviewed candidate resolution");
  assert.equal(resolution.critical_assets_sha256, digest(selected));
}
export function backendHttpReadbackName(review) {
  const continuations = review.worker_continuations?.http ?? [];
  assert.ok(Array.isArray(continuations) && continuations.length <= 4);
  const last = continuations.at(-1);
  if (last) digestString(last.predecessor_attempt_sha256);
  return last ? "worker-http-" + last.predecessor_attempt_sha256 + "-readback.json" : "worker-http-readback.json";
}
export function validateWebsitePhaseFacts({ cors, phone, admission, apiSource, appSource, httpReadbackSha }) {
  accepted(cors); assert.equal(cors.kind, "ordinary-website-cors-readiness-v1");
  assert.equal(cors.api_source, apiSource); assert.equal(cors.ordinary_origin, "https://pirate.sc");
  assert.equal(cors.http_readback_sha256, httpReadbackSha); assert.equal(cors.preflight_passed, true); assert.equal(cors.upload_passed, true);
  accepted(phone); assert.equal(phone.kind, "ordinary-website-predeployment-phone-qualification-v1");
  assert.equal(phone.api_source, apiSource); assert.equal(phone.website_source, appSource);
  assert.ok(["staging", "local-qualified"].includes(phone.qualification_environment));
  assert.equal(phone.target_ordinary_origin, "https://pirate.sc"); assert.equal(phone.passed, true);
  assert.ok(admission.phone_acceptance_sha256 && admission.disclosure_sha256 && admission.public_legal_source_sha256);
}
