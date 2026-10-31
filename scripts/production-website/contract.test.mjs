import assert from "node:assert/strict";
import test from "node:test";
import { candidateIdentity, digest, hash, validateAttemptIdentity, validateCommandLineage, validateModules, validateReadbackIdentity } from "./contract.mjs";
import { criticalAssets } from "./candidate.mjs";
import { assertWholeSourcePins } from "./context.mjs";
import { main } from "../production-website-cutover.mjs";

const sha = "a".repeat(64);
const candidate = () => ({ source: "b".repeat(40), artifact_sha256: sha, receipt_sha256: sha, config_sha256: sha,
  modules_sha256: sha, client_sha256: sha, uploader_sha256: sha });
test("ordinary Node CI can import the production entry without accessing any sibling release context", () => {
  assert.equal(typeof main, "function");
});
test("full188-module content inventory refuses missing, additional, duplicate or changed code", () => {
  const expected = Array.from({ length: 188 }, (_, index) => {
    const bytes = Buffer.from("module-" + index);
    return { name: index ? "assets/chunk-" + index + ".js" : "index.js", bytes: bytes.length, sha256: hash(bytes) };
  });
  const supplied = expected.map((row, index) => ({ name: row.name, content_type: "application/javascript+module", content_base64: Buffer.from("module-" + index).toString("base64") }));
  assert.equal(validateModules(supplied, expected).length, 188);
  assert.throws(() => validateModules(supplied.slice(1), expected));
  assert.throws(() => validateModules([...supplied, supplied[0]], expected));
  const duplicate = structuredClone(supplied); duplicate[1] = duplicate[0]; assert.throws(() => validateModules(duplicate, expected));
  const changed = structuredClone(supplied); changed[0].content_base64 = Buffer.from("changed").toString("base64"); assert.throws(() => validateModules(changed, expected));
  const extra = structuredClone(supplied); extra[0].name = "foreign.js"; assert.throws(() => validateModules(extra, expected));
  const wrongType = structuredClone(supplied); wrongType[0].content_type = "text/plain"; assert.throws(() => validateModules(wrongType, expected));
});
test("attempt and readback identities retain exact immutable bytes across review renewal", () => {
  const identity = candidateIdentity(candidate());
  const attempt = { kind: "ordinary-website-upload-attempt-v1", candidate_identity: identity, before_sha256: sha, review_sha256: sha };
  validateAttemptIdentity(attempt, identity, true);
  for (const key of Object.keys(identity)) {
    const changed = { ...identity, [key]: "0".repeat(key === "source" ? 40 : 64) };
    assert.throws(() => validateAttemptIdentity(attempt, changed, true));
  }
  assert.throws(() => validateAttemptIdentity(attempt, identity, false));
  const readback = { kind: "ordinary-website-upload-readback-v1", accepted: true, attempt_sha256: sha, candidate_identity: identity, after: { candidate_verified: true } };
  validateReadbackIdentity(readback, sha, identity, true);
  assert.throws(() => validateReadbackIdentity(readback, "0".repeat(64), identity, true));
  assert.throws(() => validateReadbackIdentity({ ...readback, after: { candidate_verified: false } }, sha, identity, true));
});
test("failed commands retain lineage without pretending their exit status proves a serving candidate", () => {
  const receipt = { kind: "ordinary-website-deployment-command-result-v1", attempt_sha256: sha, exit_code: 1,
    stdout_sha256: sha, stderr_sha256: sha, provider_output_emitted: false };
  validateCommandLineage(receipt, sha, true);
  assert.throws(() => validateCommandLineage(receipt, "0".repeat(64), true));
  assert.throws(() => validateCommandLineage({ ...receipt, exit_code: null }, sha, true));
  assert.throws(() => validateReadbackIdentity(receipt, sha, candidateIdentity(candidate()), true));
});
test("critical client probes use only exact retained asset paths and hashes", () => {
  const value = { client: [{ name: "assets/main-123.js", sha256: sha, bytes: 4 }, { name: "assets/main-123.css", sha256: sha, bytes: 2 }] };
  assert.equal(criticalAssets(value, value.client.map(row => row.name)).length, 2);
  for (const names of [["assets/main-123.js"], ["assets/main-123.js", "assets/main-123.js"], ["assets/main-123.js", "assets/../private"],
    ["assets/main-123.js", "assets/missing.js"], ["assets/main-123.js", "assets/main-123.css?query"]]) assert.throws(() => criticalAssets(value, names));
});
test("API and Solid tooling pins are distinct from application provenance and must match the whole review", () => {
  const pins = { api_tooling_source: "a".repeat(40), api_tooling_tree: "b".repeat(40), api_tooling_manifest_sha256: sha,
    solid_tooling_source: "c".repeat(40), solid_tooling_tree: "d".repeat(40), solid_tooling_manifest_sha256: "e".repeat(64) };
  const review = { tooling_source: pins.api_tooling_source, tooling_tree: pins.api_tooling_tree, adapter_manifest_sha256: sha,
    solid_tooling_source: pins.solid_tooling_source, solid_tooling_tree: pins.solid_tooling_tree, solid_tooling_manifest_sha256: pins.solid_tooling_manifest_sha256 };
  assertWholeSourcePins(review, pins);
  assert.throws(() => assertWholeSourcePins({ ...review, solid_tooling_source: pins.api_tooling_source }, pins));
  assert.notEqual(digest(review), digest({ ...review, adapter_manifest_sha256: "0".repeat(64) }));
});
