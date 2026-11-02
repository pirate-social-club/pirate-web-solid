import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertBaseline, assertConfigurationUnchanged, assertPreparedReceipt, assertServingCandidate,
  deployCommand, parseArguments, referencedAssets, rollbackCommand, toolEnvironment, writeOnce,
} from "../production-website-hotfix.mjs";
import { comparable } from "./bindings.mjs";
import { digest } from "./contract.mjs";

const source = "a".repeat(40), artifact = "b".repeat(64), receipt = "c".repeat(64);
const baseline = "d4fc8fb9-7a37-450d-9c23-73fdb17cac94", other = "11111111-1111-4111-8111-111111111111";
const reviewed = ["--source", source, "--artifact", artifact, "--receipt", receipt];
const snapshot = { bindings: [], runtime: {}, settings: {}, domains: [], subdomain: {} };

test("parseArguments accepts exact options and refuses anything else", () => {
  assert.deepEqual(parseArguments(["snapshot", ...reviewed, "--baseline", baseline]),
    { mode: "snapshot", source, artifact, receipt, baseline });
  assert.equal(parseArguments(["apply", ...reviewed, "--baseline", baseline, "--evidence", "/tmp/e"]).evidence, "/tmp/e");
  assert.equal(parseArguments(["rollback", "--baseline", baseline, "--from", other, "--evidence", "/tmp/e"]).from, other);
  assert.throws(() => parseArguments(["deploy"]), /Unknown mode/u);
  assert.throws(() => parseArguments(["snapshot", ...reviewed]), /Unexpected arguments/u);
  assert.throws(() => parseArguments(["snapshot", ...reviewed, "--worker", "other"]), /Unexpected option/u);
  assert.throws(() => parseArguments(["snapshot", "--source", "main", "--artifact", artifact, "--receipt", receipt, "--baseline", baseline]));
  assert.throws(() => parseArguments(["apply", ...reviewed, "--baseline", baseline, "--evidence", "relative"]), /absolute/u);
  assert.throws(() => parseArguments(["snapshot", "--source", source, "--source", source, "--artifact", artifact, "--receipt", receipt]), /Unexpected option/u);
});

test("toolEnvironment refuses an injected token and carries no other secrets", () => {
  assert.throws(() => toolEnvironment({ CLOUDFLARE_API_TOKEN: "x" }), /overrides the managed login/u);
  const environment = toolEnvironment({ PATH: "/bin", HOME: "/home/x", PRODUCTION_E2E_CREATOR_OTP: "123456", HNS_PRODUCTION_POSTGRES_ADMIN_URL: "postgres://x" });
  assert.equal(environment.PATH, "/bin");
  assert.equal(environment.CLOUDFLARE_ACCOUNT_ID, "08a4c22cf52e2ecae883e36f80a33f4a");
  assert.ok(!Object.keys(environment).some(key => key.includes("OTP") || key.includes("POSTGRES")));
});

test("the upload and rollback commands are exact", () => {
  assert.deepEqual(deployCommand("/n", "/w", source), ["/n", "/w", "deploy", "--config", "dist/ssr/wrangler.json", "--message", "git:" + source]);
  assert.deepEqual(rollbackCommand("/n", "/w", baseline).slice(2, 6), ["versions", "deploy", baseline + "@100", "--yes"]);
});

test("assertPreparedReceipt binds source and artifact", () => {
  const value = { kind: "pirate-website-production-prepared-v1", sourceSha: source, buildSha256: artifact };
  assertPreparedReceipt(value, { source, artifact });
  assert.throws(() => assertPreparedReceipt({ ...value, sourceSha: "e".repeat(40) }, { source, artifact }), /another source/u);
  assert.throws(() => assertPreparedReceipt({ ...value, buildSha256: "e".repeat(64) }, { source, artifact }), /another artifact/u);
  assert.throws(() => assertPreparedReceipt({ ...value, kind: "other" }, { source, artifact }));
});

test("assertBaseline requires the reviewed version to be the latest upload", () => {
  assertBaseline({ version: baseline, latest_upload_is_serving: true }, baseline);
  assert.throws(() => assertBaseline({ version: other, latest_upload_is_serving: true }, baseline), /not the reviewed baseline/u);
  assert.throws(() => assertBaseline({ version: baseline, latest_upload_is_serving: false }, baseline), /Latest upload/u);
});

test("assertConfigurationUnchanged refuses any binding or configuration change", () => {
  const same = digest(comparable(snapshot));
  assertConfigurationUnchanged({ changes: [], candidate_sha256: same }, snapshot);
  assert.throws(() => assertConfigurationUnchanged({ changes: [{ name: "X" }], candidate_sha256: same }, snapshot), /change a binding/u);
  assert.throws(() => assertConfigurationUnchanged({ changes: [], candidate_sha256: "0".repeat(64) }, snapshot), /website configuration/u);
});

test("assertServingCandidate binds source, latest upload and configuration", () => {
  const after = { ...snapshot, message: "git:" + source, latest_upload_is_serving: true };
  const expected = digest(comparable(after));
  assertServingCandidate(after, source, expected);
  assert.throws(() => assertServingCandidate({ ...after, message: "git:" + "e".repeat(40) }, source, expected), /another source/u);
  assert.throws(() => assertServingCandidate({ ...after, latest_upload_is_serving: false }, source, expected), /latest upload/u);
  assert.throws(() => assertServingCandidate(after, source, "0".repeat(64)), /configuration differs/u);
});

test("referencedAssets reads bundles from public HTML and refuses a page without them", () => {
  const html = '<link href="/assets/app-1.css"><script src="/assets/entry-2.js"></script><script src="/assets/entry-2.js"></script><a href="/posts/x">';
  assert.deepEqual(referencedAssets(html), ["assets/app-1.css", "assets/entry-2.js"]);
  assert.throws(() => referencedAssets("<html></html>"), /references no bundle/u);
});

test("writeOnce refuses a second effect marker", () => {
  const directory = mkdtempSync(join(tmpdir(), "website-hotfix-"));
  try {
    writeOnce(directory, "upload-attempt.json", { first: true });
    assert.throws(() => writeOnce(directory, "upload-attempt.json", { first: false }), /EEXIST/u);
    assert.equal(JSON.parse(readFileSync(join(directory, "upload-attempt.json"), "utf8")).first, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
