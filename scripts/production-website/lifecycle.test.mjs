import assert from "node:assert/strict";
import test from "node:test";
import { backendHttpReadbackName, nextWebsiteNames, validateContinuation, validateProbeSelection, validateWebsiteBinding, validateWebsitePhaseFacts } from "./lifecycle.mjs";
import { digest } from "./contract.mjs";
const sha = "a".repeat(64);
const acceptance = { accepted: true, reviewer_role: "independent_reviewer", findings: [] };

test("continuations require an independently accepted unchanged predecessor and derive a fresh bounded name", () => {
  const first = nextWebsiteNames(); assert.equal(first.attempt, "website-upload-attempt.json");
  validateContinuation({ ...acceptance, predecessor_attempt_sha256: sha }, sha, "baseline_unchanged");
  const next = nextWebsiteNames(sha); assert.equal(next.attempt, "website-" + sha + "-upload-attempt.json");
  assert.notEqual(first.attempt, next.attempt);
  for (const conclusion of [undefined, "candidate_verified", "not_committed"]) assert.throws(() => validateContinuation({ ...acceptance, predecessor_attempt_sha256: sha }, sha, conclusion));
  assert.throws(() => validateContinuation({ ...acceptance, predecessor_attempt_sha256: "0".repeat(64) }, sha, "baseline_unchanged"));
  assert.throws(() => nextWebsiteNames("../other"));
});
test("renewed reviews may preserve exact binding identity but may not silently substitute candidate settings", () => {
  const proposal = { baseline_version: "version", baseline_sha256: sha, candidate_sha256: sha, settings_sha256: sha, candidate_settings_sha256: sha, changes: [] };
  validateWebsiteBinding(proposal, { ...proposal });
  assert.throws(() => validateWebsiteBinding(proposal, { ...proposal, candidate_settings_sha256: "0".repeat(64) }));
  assert.throws(() => validateWebsiteBinding(proposal, { ...proposal, baseline_version: "different" }));
});
test("CORS upload readiness belongs to website apply and binds the accepted final HTTP readback", () => {
  const apiSource = "a".repeat(40), appSource = "b".repeat(40);
  const cors = { ...acceptance, kind: "ordinary-website-cors-readiness-v1", api_source: apiSource, ordinary_origin: "https://pirate.sc",
    http_readback_sha256: sha, preflight_passed: true, upload_passed: true };
  const phone = { ...acceptance, kind: "ordinary-website-predeployment-phone-qualification-v1", api_source: apiSource, website_source: appSource,
    qualification_environment: "staging", target_ordinary_origin: "https://pirate.sc", passed: true };
  const input = { cors, phone, apiSource, appSource, httpReadbackSha: sha,
    admission: { phone_acceptance_sha256: sha, disclosure_sha256: sha, public_legal_source_sha256: sha } };
  validateWebsitePhaseFacts(input);
  assert.throws(() => validateWebsitePhaseFacts({ ...input, httpReadbackSha: "0".repeat(64) }));
  assert.throws(() => validateWebsitePhaseFacts({ ...input, cors: { ...cors, upload_passed: false } }));
  assert.throws(() => validateWebsitePhaseFacts({ ...input, phone: { ...phone, qualification_environment: "production" } }));
  assert.throws(() => validateWebsitePhaseFacts({ ...input, phone: { ...phone, website_source: "0".repeat(40) } }));
});
test("final HTTP continuation readback selection follows the same retained namespace convention", () => {
  assert.equal(backendHttpReadbackName({}), "worker-http-readback.json");
  assert.equal(backendHttpReadbackName({ worker_continuations: { http: [{ predecessor_attempt_sha256: sha }] } }), "worker-http-" + sha + "-readback.json");
  assert.throws(() => backendHttpReadbackName({ worker_continuations: { http: Array(5).fill({ predecessor_attempt_sha256: sha }) } }));
});

test("probe metadata corrections need a candidate resolution bound to the exact new retained descriptors", () => {
  const previous = [{ name: "assets/old.js", sha256: sha, bytes: 1 }], selected = [{ name: "assets/main.js", sha256: sha, bytes: 2 }];
  validateProbeSelection(previous, structuredClone(previous), undefined);
  assert.throws(() => validateProbeSelection(previous, selected, undefined));
  assert.throws(() => validateProbeSelection(previous, selected, { conclusion: "baseline_unchanged", critical_assets_sha256: digest(selected) }));
  assert.throws(() => validateProbeSelection(previous, selected, { conclusion: "candidate_verified", critical_assets_sha256: "0".repeat(64) }));
  validateProbeSelection(previous, selected, { conclusion: "candidate_verified", critical_assets_sha256: digest(selected) });
});
