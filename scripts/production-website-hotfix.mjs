/**
 * Guarded upload for a website-only correction on an unchanged backend.
 *
 * The November 1 cutover executor is bound to that release's database migration
 * and its spent attempt, so it cannot carry a later website change. This keeps
 * the checks that apply to a website change and has no database or backend
 * phase. It refuses any binding, setting or domain change it can observe. It
 * cannot detect that a change needs the backend; the operator decides that.
 *
 * snapshot  read-only: proves every precondition without writing to the provider
 * apply     one upload, guarded by an exclusive marker, then verify
 * verify    read-only: proves the attempted candidate is serving
 * rollback  returns all traffic to the named baseline version
 *
 * A marker is never reset. After an uncertain result, run verify, then decide.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bindingProposal, comparable, deploymentVersions, normalizedBindings, normalizedDomains,
  normalizedRuntime, normalizedSettings, normalizedSubdomain,
} from "./production-website/bindings.mjs";
import { digest, hash, validateModules } from "./production-website/contract.mjs";
import { websiteArtifactDigest } from "./website-production-artifacts.mjs";
import { checkWebsiteProductionConfig } from "./website-production-config.mjs";
import { assertPublishedWebsiteSource } from "./website-production-source-preflight.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ACCOUNT = "08a4c22cf52e2ecae883e36f80a33f4a";
const WORKER = "pirate-web-solid-production";
const ORIGIN = "https://pirate.sc";
const CONFIG = "dist/ssr/wrangler.json";
const WRANGLER = join(ROOT, "node_modules/wrangler/bin/wrangler.js");
const UPLOAD_TIMEOUT_MS = 300_000;
const TIMED_OUT = 124;
const TOOL_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
  "XDG_DATA_HOME", "XDG_RUNTIME_DIR", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"];
/** Upload settings wrangler applies but the reviewed no-change proof does not model. */
const UNMODELLED_KEYS = ["limits", "placement", "logpush", "tail_consumers", "route", "observability"];
const SHA = /^[a-f0-9]{40}$/u, DIGEST = /^[a-f0-9]{64}$/u, VERSION = /^[a-f0-9-]{36}$/u;
const OPTIONS = {
  snapshot: { source: SHA, artifact: DIGEST, receipt: DIGEST, baseline: VERSION },
  apply: { source: SHA, artifact: DIGEST, receipt: DIGEST, baseline: VERSION, evidence: null },
  verify: { source: SHA, artifact: DIGEST, receipt: DIGEST, evidence: null },
  rollback: { baseline: VERSION, from: VERSION, evidence: null },
};

/** Exact options only: a release cannot select another provider, worker or config. */
export function parseArguments(argv) {
  const [mode, ...rest] = argv;
  assert.ok(Object.hasOwn(OPTIONS, mode ?? ""), "Unknown mode");
  const shape = OPTIONS[mode];
  assert.equal(rest.length, Object.keys(shape).length * 2, "Unexpected arguments");
  const result = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]?.replace(/^--/u, ""), value = rest[index + 1];
    assert.ok(rest[index].startsWith("--") && Object.hasOwn(shape, name) && !Object.hasOwn(result, name), "Unexpected option");
    if (shape[name]) assert.match(value, shape[name]);
    else assert.ok(isAbsolute(value), "Evidence path must be absolute");
    result[name] = value;
  }
  assert.equal(Object.keys(result).length - 1, Object.keys(shape).length, "Missing option");
  return result;
}

/** Evidence inside the checkout could change the artifact or be uploaded with it. */
export function assertEvidenceOutside(root, evidence) {
  const path = relative(root, evidence);
  assert.ok(path.startsWith("..") || isAbsolute(path), "Evidence must live outside the checkout");
}

/** Provider children get OS and transport configuration only, never an injected token. */
export function toolEnvironment(input = process.env) {
  assert.equal(input.CLOUDFLARE_API_TOKEN, undefined, "An injected provider token overrides the managed login");
  const result = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", NO_COLOR: "1" };
  for (const key of TOOL_KEYS) if (input[key] !== undefined) result[key] = input[key];
  return result;
}

/** Reads the login wrangler stores. Printing it through wrangler would copy it into a log. */
export function parseStoredLogin(text) {
  const token = text.match(/^oauth_token\s*=\s*"([^"]+)"/mu)?.[1];
  const expiry = Date.parse(text.match(/^expiration_time\s*=\s*"([^"]+)"/mu)?.[1] ?? "");
  return { token, expiresAt: Number.isFinite(expiry) ? expiry : 0 };
}

export const deployCommand = (node, wrangler, source) =>
  [node, wrangler, "deploy", "--config", CONFIG, "--message", "git:" + source];
export const rollbackCommand = (node, wrangler, baseline) =>
  [node, wrangler, "versions", "deploy", baseline + "@100", "--name", WORKER, "--yes", "--message", "rollback to " + baseline];

export function assertPreparedReceipt(receipt, expected) {
  assert.equal(receipt.kind, "pirate-website-production-prepared-v1");
  assert.equal(receipt.sourceSha, expected.source, "Receipt names another source");
  assert.equal(receipt.buildSha256, expected.artifact, "Receipt names another artifact");
}

export function assertBaseline(before, baseline, source) {
  assert.equal(before.version, baseline, "Serving version is not the reviewed baseline");
  assert.equal(before.latest_upload_is_serving, true, "Latest upload is not the serving baseline");
  assert.notEqual(before.message, "git:" + source, "This source is already serving");
}

/** The artifact may change application bytes only, so the proposal must be a no-op. */
export function assertConfigurationUnchanged(proposal, before) {
  assert.deepEqual(proposal.changes, [], "Upload would change a binding");
  assert.equal(proposal.candidate_sha256, digest(comparable(before)), "Upload would change website configuration");
}

/** Covers what the no-change proof cannot see: wrangler applies these on upload. */
export function assertUploadPreservesSettings(config, before) {
  for (const key of UNMODELLED_KEYS) assert.equal(config[key], undefined, "Built configuration sets an unreviewed key: " + key);
  assert.notEqual(before.settings.observability?.enabled, true, "Upload would turn off live observability");
  const required = new Set(config.secrets?.required ?? []);
  for (const row of before.bindings) {
    if (["secret_text", "secret_key"].includes(row.type)) assert.ok(required.has(row.name), "Undeclared live secret: " + row.name);
  }
}

export function assertServingCandidate(after, source, expected) {
  assert.equal(after.message, "git:" + source, "Serving version names another source");
  assert.equal(after.latest_upload_is_serving, true, "Candidate is not the latest upload");
  assert.equal(digest(comparable(after)), expected, "Serving configuration differs");
}

/** Assets the public HTML references, which must all belong to the candidate. */
export function referencedAssets(html) {
  const names = [...html.matchAll(/(?:src|href)="\/(assets\/[a-zA-Z0-9_.-]+\.(?:js|css))"/gu)].map(match => match[1]);
  const unique = [...new Set(names)].sort();
  assert.ok(unique.some(name => name.endsWith(".js")) && unique.some(name => name.endsWith(".css")), "Public HTML references no bundle");
  return unique;
}

/** Exclusive create: a second apply or rollback refuses instead of repeating an effect. */
export function writeOnce(directory, name, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

async function verifyServing(options, candidate, io, expected) {
  const after = await io.collect();
  assertServingCandidate(after, options.source, expected);
  const modules = await io.compiled(candidate, after.version);
  let assets;
  // Edge propagation can lag the provider's own answer, so only this read repeats.
  for (let attempt = 1; ; attempt += 1) {
    try { assets = await io.served(candidate); break; }
    catch (error) { if (attempt >= 6) throw error; await io.pause(10_000); }
  }
  assert.deepEqual(await io.collect(), after, "Website identity changed during readback");
  return { version: after.version, deployment: after.deployment, compiled_module_count: modules.length, compiled_modules_sha256: digest(modules), ...assets };
}

/** Effect ordering lives here so tests can prove it against a fake provider. */
export async function release(options, io) {
  if (options.mode === "rollback") {
    assert.equal(await io.servingVersion(), options.from, "Serving version is not the version being rolled back");
    io.record("rollback-attempt.json", { at: io.now(), from: options.from, to: options.baseline });
    const result = await io.rollback(options.baseline);
    io.record("rollback-command-result.json", { at: io.now(), ...result });
    assert.equal(result.exit_code, 0, "Rollback refused or unresolved");
    assert.equal(await io.servingVersion(), options.baseline, "Baseline is not serving after rollback");
    return { rolled_back: true, version: options.baseline };
  }
  const candidate = await io.candidate(), identity = digest(candidate);
  const unchangedCandidate = async () => assert.equal(digest(await io.candidate()), identity, "Candidate changed during the release");
  if (options.mode === "verify") {
    const attempt = io.read("upload-attempt.json");
    assert.ok(attempt, "No upload attempt to verify");
    assert.equal(attempt.source, options.source, "Attempt names another source");
    assert.equal(attempt.artifact, options.artifact, "Attempt names another artifact");
    const before = await io.collect();
    const proposal = bindingProposal(before, candidate.config);
    assertConfigurationUnchanged(proposal, before);
    assert.equal(proposal.candidate_sha256, attempt.configuration_sha256, "Serving configuration differs from the attempt");
    const result = await verifyServing(options, candidate, io, attempt.configuration_sha256);
    await unchangedCandidate();
    io.record("verify-" + Date.now() + ".json", { at: io.now(), source: options.source, artifact: options.artifact, rollback_target: attempt.baseline, ...result });
    return { verified: true, version: result.version, compiled_module_count: result.compiled_module_count, client_files_checked: result.client_files_checked, rollback_target: attempt.baseline };
  }
  const before = await io.collect();
  assertBaseline(before, options.baseline, options.source);
  const proposal = bindingProposal(before, candidate.config);
  assertConfigurationUnchanged(proposal, before);
  assertUploadPreservesSettings(candidate.config, before);
  if (options.mode === "snapshot") {
    return { read_only: true, baseline: before.version, baseline_message: before.message, configuration_sha256: proposal.candidate_sha256,
      binding_count: before.bindings.length, domains: before.domains.map(row => row.hostname), candidate_modules: candidate.modules.length, candidate_client_files: candidate.client.length };
  }
  assert.deepEqual(await io.collect(), before, "Website changed before upload");
  await unchangedCandidate();
  io.record("upload-attempt.json", { at: io.now(), source: options.source, artifact: options.artifact, receipt: options.receipt,
    baseline: before.version, configuration_sha256: proposal.candidate_sha256, uploader: candidate.uploader });
  const result = await io.upload(options.source);
  io.record("upload-command-result.json", { at: io.now(), ...result });
  assert.equal(result.exit_code, 0, "Upload refused or unresolved. Do not retry; run verify");
  const readback = await verifyServing(options, candidate, io, proposal.candidate_sha256);
  await unchangedCandidate();
  io.record("upload-readback.json", { at: io.now(), source: options.source, artifact: options.artifact, rollback_target: before.version, ...readback });
  return { uploaded: true, version: readback.version, rollback_target: before.version, compiled_module_count: readback.compiled_module_count, client_files_checked: readback.client_files_checked };
}

function run(argv, environment, timeout = 30_000, maxBuffer = 64 * 1024 * 1024) {
  const started = Date.now();
  return new Promise(done => {
    execFile(argv[0], argv.slice(1), { cwd: ROOT, env: environment, timeout, maxBuffer, encoding: "buffer" }, (error, stdout, stderr) => {
      // The wrangler wrapper exits 0 when its child dies by signal, so time decides.
      const timedOut = Date.now() - started >= timeout;
      done({ exitCode: timedOut ? TIMED_OUT : error ? (typeof error.code === "number" ? error.code : 1) : 0, timedOut, stdout, stderr });
    });
  });
}
const commandReceipt = result => ({ exit_code: result.exitCode, timed_out: result.timedOut, stdout_sha256: hash(result.stdout), stderr_sha256: hash(result.stderr) });

async function wranglerJson(argv, environment) {
  const result = await run([process.execPath, WRANGLER, ...argv], environment);
  assert.equal(result.exitCode, 0, "Provider read refused");
  return JSON.parse(result.stdout.toString("utf8"));
}

/** Read per use: an upload can outlast a login. wrangler renews only once it has expired. */
async function managedToken(environment) {
  const path = join(environment.XDG_CONFIG_HOME ?? join(environment.HOME, ".config"), ".wrangler/config/default.toml");
  let login = parseStoredLogin(readFileSync(path, "utf8"));
  const remaining = login.expiresAt - Date.now();
  if (remaining < 30_000) {
    if (remaining > 0) await new Promise(wake => setTimeout(wake, remaining + 1_000));
    await run([process.execPath, WRANGLER, "whoami"], environment, 60_000);
    login = parseStoredLogin(readFileSync(path, "utf8"));
  }
  assert.ok(typeof login.token === "string" && login.expiresAt - Date.now() > 30_000, "Managed provider login is unavailable");
  return login.token;
}

async function providerApi(path, environment) {
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + path, {
    headers: { authorization: "Bearer " + await managedToken(environment) }, signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.success === true, "Provider read refused");
  return body.result;
}

async function servingVersion(environment) {
  return deploymentVersions(await wranglerJson(["deployments", "list", "--name", WORKER, "--json"], environment)).version;
}

/** Output is reduced before use: secret values are never returned by these reads. */
async function collectWebsite(environment) {
  const deployment = () => wranglerJson(["deployments", "list", "--name", WORKER, "--json"], environment);
  const serving = deploymentVersions(await deployment());
  const version = await wranglerJson(["versions", "view", serving.version, "--name", WORKER, "--json"], environment);
  assert.equal(version.id, serving.version);
  const script = "/workers/scripts/" + WORKER;
  const latest = await providerApi(script + "/versions", environment);
  assert.match(latest.items?.[0]?.id ?? "", VERSION);
  const domains = await providerApi("/workers/domains?per_page=100", environment);
  assert.ok(Array.isArray(domains) && domains.length < 100, "Custom-domain inventory needs pagination");
  const snapshot = {
    version: serving.version, deployment: serving.deployment,
    message: typeof version.annotations?.["workers/message"] === "string" ? version.annotations["workers/message"] : null,
    bindings: normalizedBindings(version.resources.bindings), runtime: normalizedRuntime(version.resources.script_runtime),
    settings: normalizedSettings(await providerApi(script + "/settings", environment)), domains: normalizedDomains(domains, WORKER),
    subdomain: normalizedSubdomain(await providerApi(script + "/subdomain", environment)),
    latest_upload_version: latest.items[0].id, latest_upload_is_serving: latest.items[0].id === serving.version,
  };
  assert.deepEqual(deploymentVersions(await deployment()), serving, "Website traffic changed during observation");
  return snapshot;
}

async function inventory(directory, moduleOnly) {
  const rows = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name), stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink() && await realpath(path) === resolve(path));
      if (stat.isDirectory()) await visit(path);
      else if (!moduleOnly || /\.(?:js|mjs)$/u.test(entry.name)) {
        const bytes = await readFile(path);
        rows.push({ name: relative(directory, path).split("\\").join("/"), sha256: hash(bytes), bytes: bytes.length });
      }
    }
  }
  await visit(directory);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function preparedCandidate(options) {
  assert.equal(assertPublishedWebsiteSource(ROOT), options.source, "Checkout is not the reviewed published source");
  const receiptBytes = await readFile(join(ROOT, "dist/website-production-prepared.json"));
  assert.equal(hash(receiptBytes), options.receipt, "Prepared receipt differs");
  assertPreparedReceipt(JSON.parse(receiptBytes.toString("utf8")), options);
  assert.equal(await websiteArtifactDigest(ROOT), options.artifact, "Built artifact differs");
  const config = JSON.parse(await readFile(join(ROOT, CONFIG), "utf8"));
  checkWebsiteProductionConfig(JSON.parse(await readFile(join(ROOT, "wrangler.jsonc"), "utf8")), config);
  const modules = await inventory(join(ROOT, "dist/ssr"), true), client = await inventory(join(ROOT, "dist/client"), false);
  assert.ok(modules.some(row => row.name === "index.js") && client.length > 0);
  const installed = JSON.parse(await readFile(join(ROOT, "node_modules/wrangler/package.json"), "utf8")).version;
  const declared = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(installed, declared.devDependencies?.wrangler ?? declared.dependencies?.wrangler, "Installed uploader differs from the lockfile");
  const uploader = { node: process.version, wrangler: installed, cli_sha256: hash(await readFile(join(ROOT, "node_modules/wrangler/wrangler-dist/cli.js"))) };
  return { config, modules, client, uploader };
}

async function compiledModules(candidate, versionId, environment) {
  const result = await run(["cf", "workers", "versions", "get", versionId, "--worker-id", WORKER, "--include", "modules"],
    { ...environment, CLOUDFLARE_API_TOKEN: await managedToken(environment) });
  assert.equal(result.exitCode, 0, "Provider module read refused");
  const version = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(version.id, versionId); assert.equal(version.main_module, "index.js", "Provider entry module differs");
  assert.equal(version.compatibility_date, candidate.config.compatibility_date, "Provider compatibility date differs");
  assert.deepEqual([...(version.compatibility_flags ?? [])].sort(), [...candidate.config.compatibility_flags].sort(), "Provider compatibility flags differ");
  return validateModules(version.modules, candidate.modules);
}

/** Checks every hashed client file, including lazy chunks the root page does not name. */
async function servedAssets(candidate) {
  const page = await fetch(ORIGIN + "/", { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  assert.equal(page.status, 200, "Public root refused");
  const referenced = referencedAssets(await page.text());
  for (const name of referenced) assert.ok(candidate.client.some(row => row.name === name), "Public HTML references an asset outside the candidate: " + name);
  const queue = candidate.client.filter(row => row.name.startsWith("assets/"));
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < queue.length) {
      const row = queue[next++];
      const response = await fetch(ORIGIN + "/" + row.name, { redirect: "error", credentials: "omit", cache: "no-store",
        signal: AbortSignal.timeout(30_000), headers: { "accept-encoding": "identity" } });
      assert.equal(response.status, 200, "Candidate asset refused: " + row.name);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), row.sha256, "Served asset differs: " + row.name);
    }
  }));
  return { referenced_assets: referenced.length, client_files_checked: queue.length, client_files_total: candidate.client.length };
}

function productionIo(options, environment) {
  const evidence = options.evidence;
  return {
    now: () => new Date().toISOString(),
    pause: milliseconds => new Promise(wake => setTimeout(wake, milliseconds)),
    candidate: () => preparedCandidate(options),
    collect: () => collectWebsite(environment),
    servingVersion: () => servingVersion(environment),
    compiled: (candidate, version) => compiledModules(candidate, version, environment),
    served: candidate => servedAssets(candidate),
    record: (name, value) => writeOnce(evidence, name, value),
    read: name => (existsSync(join(evidence, name)) ? JSON.parse(readFileSync(join(evidence, name), "utf8")) : undefined),
    upload: async source => commandReceipt(await run(deployCommand(process.execPath, WRANGLER, source), environment, UPLOAD_TIMEOUT_MS)),
    rollback: async baseline => commandReceipt(await run(rollbackCommand(process.execPath, WRANGLER, baseline), environment, 120_000)),
  };
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.evidence) assertEvidenceOutside(ROOT, options.evidence);
  return release(options, productionIo(options, toolEnvironment()));
}

/** After a failure the operator needs the two versions a rollback decision takes. */
async function recoveryFacts(argv) {
  const facts = {};
  try {
    const options = parseArguments(argv);
    const attempt = options.evidence ? productionIo(options, {}).read("upload-attempt.json") : undefined;
    if (attempt) facts.rollback_target = attempt.baseline;
    facts.serving_version = await servingVersion(toolEnvironment());
  } catch { /* the original refusal is what the operator must read */ }
  return facts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  main(argv).then(value => console.log(JSON.stringify(value))).catch(async error => {
    // Assertion text is authored above; provider output is never echoed.
    const message = error instanceof assert.AssertionError ? error.message : "Website operation refused or unresolved";
    console.error(JSON.stringify({ success: false, message, ...await recoveryFacts(argv) }));
    process.exitCode = 1;
  });
}
