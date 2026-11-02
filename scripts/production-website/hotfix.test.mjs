import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertBaseline, assertConfigurationUnchanged, assertEvidenceOutside, assertPreparedReceipt, assertServingCandidate,
  assertUploadPreservesSettings, deployCommand, parseArguments, parseStoredLogin, referencedAssets, release, rollbackCommand,
  toolEnvironment, writeOnce,
} from "../production-website-hotfix.mjs";
import { comparable } from "./bindings.mjs";
import { digest } from "./contract.mjs";

const source = "a".repeat(40), artifact = "b".repeat(64), receipt = "c".repeat(64);
const baseline = "d4fc8fb9-7a37-450d-9c23-73fdb17cac94", uploaded = "11111111-1111-4111-8111-111111111111";
const reviewed = ["--source", source, "--artifact", artifact, "--receipt", receipt];
const config = {
  vars: { API_NEXT_ORIGIN: "https://api-next.pirate.sc" }, assets: { directory: "../client", binding: "ASSETS" },
  version_metadata: { binding: "CF_VERSION_METADATA" }, durable_objects: { bindings: [] }, migrations: [{ tag: "v1" }],
  secrets: { required: ["KEY"] }, compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"],
  routes: [{ pattern: "pirate.sc", custom_domain: true }], workers_dev: false, preview_urls: false,
};
const website = (overrides = {}) => ({
  version: baseline, deployment: "deployment-1", message: "git:" + "d".repeat(40), latest_upload_version: baseline, latest_upload_is_serving: true,
  bindings: [
    { name: "API_NEXT_ORIGIN", type: "plain_text", text: "https://api-next.pirate.sc" }, { name: "ASSETS", type: "assets" },
    { name: "CF_VERSION_METADATA", type: "version_metadata" }, { name: "KEY", type: "secret_text" },
  ].sort((a, b) => a.name.localeCompare(b.name)),
  runtime: { compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"], migration_tag: "v1", usage_model: "standard",
    assets: { serve_directly: true, raw_run_worker_first: false, base_path: "/" } },
  settings: { compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"], placement: {} },
  domains: [{ hostname: "pirate.sc", service: "pirate-web-solid-production", environment: null }],
  subdomain: { enabled: false, previews_enabled: false }, ...overrides,
});
const served = () => website({ version: uploaded, deployment: "deployment-2", message: "git:" + source, latest_upload_version: uploaded });
const candidate = () => ({ config, modules: [{ name: "index.js", sha256: "e".repeat(64), bytes: 1 }], client: [{ name: "assets/a.js", sha256: "f".repeat(64), bytes: 1 }], uploader: { wrangler: "4.123.0" } });
const options = mode => ({ mode, source, artifact, receipt, baseline, evidence: "/outside" });

/** A provider that answers in order, and remembers every effect it was asked for. */
function fakeIo({ reads, candidates, uploadResult = { exit_code: 0 }, stored = {} }) {
  const log = [], records = { ...stored }, queue = [...reads], prepared = candidates ?? [candidate()];
  const io = {
    log, records, now: () => "2026-11-02T00:00:00.000Z", pause: async () => { log.push("pause"); },
    candidate: async () => (prepared.length > 1 ? prepared.shift() : prepared[0]),
    collect: async () => { assert.ok(queue.length, "unexpected provider read"); log.push("collect"); return queue.length > 1 ? queue.shift() : queue[0]; },
    servingVersion: async () => { log.push("serving"); return queue.length > 1 ? queue.shift() : queue[0]; },
    compiled: async () => { log.push("compiled"); return [{ name: "index.js" }]; },
    served: async () => { log.push("served"); return { referenced_assets: 1, client_files_checked: 1, client_files_total: 1 }; },
    record: (name, value) => { assert.ok(!(name in records), "second write of " + name); log.push("record:" + name); records[name] = value; },
    read: name => records[name],
    upload: async () => { log.push("upload"); return uploadResult; },
    rollback: async () => { log.push("rollback"); return { exit_code: 0 }; },
  };
  return io;
}

test("parseArguments accepts exact options and refuses anything else", () => {
  assert.deepEqual(parseArguments(["snapshot", ...reviewed, "--baseline", baseline]), { mode: "snapshot", source, artifact, receipt, baseline });
  assert.equal(parseArguments(["apply", ...reviewed, "--baseline", baseline, "--evidence", "/tmp/e"]).evidence, "/tmp/e");
  assert.equal(parseArguments(["verify", ...reviewed, "--evidence", "/tmp/e"]).mode, "verify");
  assert.equal(parseArguments(["rollback", "--baseline", baseline, "--from", uploaded, "--evidence", "/tmp/e"]).from, uploaded);
  assert.throws(() => parseArguments(["deploy"]), /Unknown mode/u);
  assert.throws(() => parseArguments(["constructor"]), /Unknown mode/u);
  assert.throws(() => parseArguments([]), /Unknown mode/u);
  assert.throws(() => parseArguments(["snapshot", ...reviewed]), /Unexpected arguments/u);
  assert.throws(() => parseArguments(["snapshot", ...reviewed, "--worker", "other"]), /Unexpected option/u);
  assert.throws(() => parseArguments(["snapshot", ...reviewed, "--constructor", "x"]), /Unexpected option/u);
  assert.throws(() => parseArguments(["snapshot", "--source", "main", "--artifact", artifact, "--receipt", receipt, "--baseline", baseline]));
  assert.throws(() => parseArguments(["apply", ...reviewed, "--baseline", baseline, "--evidence", "relative"]), /absolute/u);
  assert.throws(() => parseArguments(["snapshot", "--source", source, "--source", source, "--artifact", artifact, "--receipt", receipt]), /Unexpected option/u);
});

test("evidence must stay outside the checkout", () => {
  assertEvidenceOutside("/repo/", "/archive/release");
  assert.throws(() => assertEvidenceOutside("/repo/", "/repo/dist/client/evidence"), /outside the checkout/u);
});

test("toolEnvironment refuses an injected token, stops log writes and carries no other secrets", () => {
  assert.throws(() => toolEnvironment({ CLOUDFLARE_API_TOKEN: "x" }), /overrides the managed login/u);
  const environment = toolEnvironment({ PATH: "/bin", HOME: "/home/x", PRODUCTION_E2E_CREATOR_OTP: "123456", HNS_PRODUCTION_POSTGRES_ADMIN_URL: "postgres://x" });
  assert.equal(environment.PATH, "/bin");
  assert.equal(environment.WRANGLER_WRITE_LOGS, "false");
  assert.equal(environment.CLOUDFLARE_ACCOUNT_ID, "08a4c22cf52e2ecae883e36f80a33f4a");
  assert.ok(!Object.keys(environment).some(key => key.includes("OTP") || key.includes("POSTGRES")));
});

test("parseStoredLogin reads the token and its expiry, and treats a bad date as expired", () => {
  const login = parseStoredLogin('oauth_token = "abc"\nexpiration_time = "2026-11-02T01:00:00.000Z"\n');
  assert.deepEqual(login, { token: "abc", expiresAt: Date.parse("2026-11-02T01:00:00.000Z") });
  assert.equal(parseStoredLogin('oauth_token = "abc"\nexpiration_time = "soon"\n').expiresAt, 0);
  assert.equal(parseStoredLogin("").token, undefined);
});

test("the upload and rollback commands are exact, and rollback needs no built config", () => {
  assert.deepEqual(deployCommand("/n", "/w", source), ["/n", "/w", "deploy", "--config", "dist/ssr/wrangler.json", "--message", "git:" + source]);
  const rollback = rollbackCommand("/n", "/w", baseline);
  assert.deepEqual(rollback.slice(2, 8), ["versions", "deploy", baseline + "@100", "--name", "pirate-web-solid-production", "--yes"]);
  assert.ok(!rollback.includes("--config"));
});

test("assertPreparedReceipt binds source and artifact", () => {
  const value = { kind: "pirate-website-production-prepared-v1", sourceSha: source, buildSha256: artifact };
  assertPreparedReceipt(value, { source, artifact });
  assert.throws(() => assertPreparedReceipt({ ...value, sourceSha: "e".repeat(40) }, { source, artifact }), /another source/u);
  assert.throws(() => assertPreparedReceipt({ ...value, buildSha256: "e".repeat(64) }, { source, artifact }), /another artifact/u);
  assert.throws(() => assertPreparedReceipt({ ...value, kind: "other" }, { source, artifact }));
});

test("assertBaseline requires the reviewed version, the latest upload and a different source", () => {
  assertBaseline(website(), baseline, source);
  assert.throws(() => assertBaseline(website({ version: uploaded }), baseline, source), /not the reviewed baseline/u);
  assert.throws(() => assertBaseline(website({ latest_upload_is_serving: false }), baseline, source), /Latest upload/u);
  assert.throws(() => assertBaseline(website({ message: "git:" + source }), baseline, source), /already serving/u);
});

test("assertConfigurationUnchanged refuses any binding or configuration change", () => {
  const same = digest(comparable(website()));
  assertConfigurationUnchanged({ changes: [], candidate_sha256: same }, website());
  assert.throws(() => assertConfigurationUnchanged({ changes: [{ name: "X" }], candidate_sha256: same }, website()), /change a binding/u);
  assert.throws(() => assertConfigurationUnchanged({ changes: [], candidate_sha256: "0".repeat(64) }, website()), /website configuration/u);
});

test("assertUploadPreservesSettings refuses what the no-change proof cannot see", () => {
  assertUploadPreservesSettings(config, website());
  for (const key of ["limits", "placement", "logpush", "tail_consumers", "route", "observability"]) {
    assert.throws(() => assertUploadPreservesSettings({ ...config, [key]: {} }, website()), /unreviewed key/u);
  }
  assert.throws(() => assertUploadPreservesSettings(config, website({ settings: { observability: { enabled: true } } })), /observability/u);
  const extra = website({ bindings: [...website().bindings, { name: "OTHER", type: "secret_text" }] });
  assert.throws(() => assertUploadPreservesSettings(config, extra), /Undeclared live secret/u);
});

test("assertServingCandidate binds source, latest upload and configuration", () => {
  const expected = digest(comparable(served()));
  assertServingCandidate(served(), source, expected);
  assert.throws(() => assertServingCandidate({ ...served(), message: "git:" + "e".repeat(40) }, source, expected), /another source/u);
  assert.throws(() => assertServingCandidate({ ...served(), latest_upload_is_serving: false }, source, expected), /latest upload/u);
  assert.throws(() => assertServingCandidate(served(), source, "0".repeat(64)), /configuration differs/u);
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

test("snapshot proves preconditions and makes no effect", async () => {
  const io = fakeIo({ reads: [website()] });
  const result = await release(options("snapshot"), io);
  assert.equal(result.read_only, true);
  assert.equal(result.baseline, baseline);
  assert.deepEqual(Object.keys(io.records), []);
  assert.ok(!io.log.includes("upload"));
});

test("apply writes its marker before the one upload, then reads back", async () => {
  const io = fakeIo({ reads: [website(), website(), served()] });
  const result = await release(options("apply"), io);
  assert.equal(result.uploaded, true);
  assert.equal(result.rollback_target, baseline);
  assert.equal(io.log.filter(row => row === "upload").length, 1);
  assert.ok(io.log.indexOf("record:upload-attempt.json") < io.log.indexOf("upload"));
  assert.ok(io.log.indexOf("upload") < io.log.indexOf("record:upload-command-result.json"));
  assert.ok(io.log.indexOf("compiled") < io.log.indexOf("record:upload-readback.json"));
  assert.ok(io.log.indexOf("served") < io.log.indexOf("record:upload-readback.json"));
  assert.equal(io.records["upload-attempt.json"].baseline, baseline);
});

test("apply refuses every failed precondition before any marker", async t => {
  const cases = {
    "wrong baseline": { reads: [website({ version: uploaded })] },
    "not latest upload": { reads: [website({ latest_upload_is_serving: false })] },
    "already serving": { reads: [website({ message: "git:" + source })] },
    "configuration drift": { reads: [website({ settings: { placement: {}, compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"], tags: ["x"], usage_model: "bundled" }, runtime: { ...website().runtime, usage_model: "bundled" } })] },
    "live observability": { reads: [website({ settings: { ...website().settings, observability: { enabled: true } } })] },
    "website changed before upload": { reads: [website(), website({ deployment: "deployment-9" })] },
    "artifact changed before upload": { reads: [website()], candidates: [candidate(), { ...candidate(), client: [] }] },
  };
  for (const [name, scenario] of Object.entries(cases)) {
    await t.test(name, async () => {
      const io = fakeIo(scenario);
      await assert.rejects(release(options("apply"), io));
      assert.deepEqual(Object.keys(io.records), []);
      assert.ok(!io.log.includes("upload"));
    });
  }
});

test("apply keeps its marker and never retries after an uncertain upload", async () => {
  const io = fakeIo({ reads: [website(), website(), served()], uploadResult: { exit_code: 124, timed_out: true } });
  await assert.rejects(release(options("apply"), io), /Do not retry; run verify/u);
  assert.equal(io.log.filter(row => row === "upload").length, 1);
  assert.equal(io.records["upload-command-result.json"].timed_out, true);
  assert.ok(!("upload-readback.json" in io.records));
  await assert.rejects(release(options("apply"), io));
  assert.equal(io.log.filter(row => row === "upload").length, 1);
});

test("apply reports failure when the artifact changes during upload", async () => {
  const io = fakeIo({ reads: [website(), website(), served()], candidates: [candidate(), candidate(), { ...candidate(), client: [] }] });
  await assert.rejects(release(options("apply"), io), /Candidate changed/u);
  assert.ok(!("upload-readback.json" in io.records));
});

test("readback repeats only the edge read, and gives up", async () => {
  const io = fakeIo({ reads: [website(), website(), served()] });
  let failures = 2;
  const served_ = io.served;
  io.served = async candidateValue => { if (failures-- > 0) throw new Error("edge lag"); return served_(candidateValue); };
  assert.equal((await release(options("apply"), io)).uploaded, true);
  assert.equal(io.log.filter(row => row === "pause").length, 2);
  const stuck = fakeIo({ reads: [website(), website(), served()] });
  stuck.served = async () => { throw new Error("stale"); };
  await assert.rejects(release(options("apply"), stuck), /stale/u);
  assert.equal(stuck.log.filter(row => row === "pause").length, 5);
  assert.ok(!("upload-readback.json" in stuck.records));
});

test("verify compares the live site with the attempt, not with itself", async () => {
  const configuration = digest(comparable(website()));
  const attempt = { source, artifact, baseline, configuration_sha256: configuration };
  const good = fakeIo({ reads: [served()], stored: { "upload-attempt.json": attempt } });
  assert.equal((await release(options("verify"), good)).verified, true);
  const wrongOrigin = website({ bindings: website().bindings.map(row => row.name === "API_NEXT_ORIGIN" ? { ...row, text: "https://evil.example" } : row), version: uploaded, message: "git:" + source, latest_upload_version: uploaded });
  await assert.rejects(release(options("verify"), fakeIo({ reads: [wrongOrigin], stored: { "upload-attempt.json": attempt } })), /change a binding/u);
  const wrongDate = served();
  wrongDate.runtime = { ...wrongDate.runtime, compatibility_date: "2020-01-01" };
  await assert.rejects(release(options("verify"), fakeIo({ reads: [wrongDate], stored: { "upload-attempt.json": attempt } })), /configuration/u);
  await assert.rejects(release(options("verify"), fakeIo({ reads: [served()], stored: { "upload-attempt.json": { ...attempt, configuration_sha256: "0".repeat(64) } } })), /differs from the attempt/u);
  await assert.rejects(release(options("verify"), fakeIo({ reads: [served()], stored: { "upload-attempt.json": { ...attempt, artifact: "9".repeat(64) } } })), /another artifact/u);
  await assert.rejects(release(options("verify"), fakeIo({ reads: [served()] })), /No upload attempt/u);
  await assert.rejects(release(options("verify"), fakeIo({ reads: [website(), website()], stored: { "upload-attempt.json": attempt } })), /another source/u);
});

test("rollback checks both ends and cannot repeat", async () => {
  const rollback = { mode: "rollback", baseline, from: uploaded, evidence: "/outside" };
  const io = fakeIo({ reads: [uploaded, baseline] });
  assert.deepEqual(await release(rollback, io), { rolled_back: true, version: baseline });
  assert.ok(io.log.indexOf("record:rollback-attempt.json") < io.log.indexOf("rollback"));
  await assert.rejects(release(rollback, fakeIo({ reads: [baseline] })), /not the version being rolled back/u);
  await assert.rejects(release(rollback, fakeIo({ reads: [uploaded, uploaded] })), /Baseline is not serving/u);
  await assert.rejects(release(rollback, fakeIo({ reads: [uploaded], stored: { "rollback-attempt.json": {} } })), /second write/u);
});
