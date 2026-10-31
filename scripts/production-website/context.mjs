import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertPublishedWebsiteSource } from "../website-production-source-preflight.mjs";
import { API_APP_SOURCE, API_REPO, APP_REPO, APP_SOURCE, APP_TREE, EVIDENCE_ROOT, EXECUTOR, FACTS_PATH, TOOLING_REPO } from "./paths.mjs";
import { hash } from "./contract.mjs";

/** Bootstrap cannot import API code before verifying its closure. Keep only Git's tool/transport configuration here. */
export function bootstrapToolEnvironment(input = process.env) {
  const keys = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
    "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"];
  return { ...Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, input[key]])), GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
}
const git = (root, args) => execFileSync("/usr/bin/git", args, { cwd: root, encoding: "utf8", timeout: 30_000, env: bootstrapToolEnvironment(), maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
function clean(root) {
  assert.equal(realpathSync(root), resolve(root)); assert.equal(git(root, ["rev-parse", "--show-toplevel"]), resolve(root));
  assert.equal(git(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  return { source: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
}
function sourceClosure(root, manifestPath, prefixes) {
  const bytes = readFileSync(join(root, manifestPath)); const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(manifest.kind, "ordinary-website-tooling-source-v1");
  const files = git(root, ["ls-files", "--", ...prefixes]).split("\n").filter(name => name && name !== manifestPath).sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), files);
  for (const name of files) {
    const path = join(root, name); assert.equal(realpathSync(path), resolve(path)); assert.equal(hash(readFileSync(path)), manifest.files[name]);
  }
  return hash(bytes);
}
function apiClosure() {
  const prefix = "scripts/production-release/";
  const bytes = readFileSync(join(API_REPO, prefix + "source-manifest.json")); const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(manifest.kind, "website-production-release-source-manifest-v1");
  const files = git(API_REPO, ["ls-files", "--", prefix]).split("\n").filter(name => name && name !== prefix + "source-manifest.json").sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), files.map(name => name.slice(prefix.length)));
  for (const name of files) {
    const path = join(API_REPO, name); assert.equal(realpathSync(path), resolve(path)); assert.equal(hash(readFileSync(path)), manifest.files[name.slice(prefix.length)]);
  }
  const changes = git(API_REPO, ["diff", "--name-only", "--no-renames", API_APP_SOURCE, "HEAD", "--"]).split("\n").filter(Boolean);
  assert.ok(changes.every(name => name.startsWith(prefix) || name.startsWith("scripts/production-compatibility/") || name === "tsconfig.scripts.json"));
  return hash(bytes);
}
function assertToolingOnlyChanges() {
  const names = git(TOOLING_REPO, ["diff", "--name-only", "--no-renames", APP_SOURCE, "HEAD", "--"]).split("\n").filter(Boolean);
  assert.ok(names.every(name => name.startsWith("scripts/production-website/") || name === "scripts/production-website-cutover.mjs" || name === "package.json"));
  const before = JSON.parse(execFileSync("/usr/bin/git", ["show", APP_SOURCE + ":package.json"], { cwd: TOOLING_REPO, encoding: "utf8", timeout: 10_000, env: bootstrapToolEnvironment() }));
  const after = JSON.parse(readFileSync(join(TOOLING_REPO, "package.json"), "utf8"));
  const expectedScripts = { ...before.scripts, "test:production:website-executor": "node --test scripts/production-website/*.test.mjs",
    "test:production:website": before.scripts["test:production:website"] + " && bun run test:production:website-executor" };
  assert.deepEqual(after.scripts, expectedScripts); assert.deepEqual({ ...after, scripts: before.scripts }, before);
}

/** Source-only bootstrap precedes URL consumption and does not require future whole-release facts. */
export function verifiedSourcePins() {
  const own = clean(TOOLING_REPO), api = clean(API_REPO), app = clean(APP_REPO);
  assert.equal(app.source, APP_SOURCE); assert.equal(app.tree, APP_TREE); assertToolingOnlyChanges();
  assert.equal(assertPublishedWebsiteSource(TOOLING_REPO, args => git(TOOLING_REPO, args)), own.source);
  assert.equal(assertPublishedWebsiteSource(APP_REPO, args => git(APP_REPO, args)), APP_SOURCE);
  assert.equal(git(API_REPO, ["remote", "get-url", "origin"]), "https://github.com/pirate-social-club/api-next.git");
  git(API_REPO, ["fetch", "--no-tags", "origin", "refs/heads/main"]);
  git(API_REPO, ["merge-base", "--is-ancestor", api.source, git(API_REPO, ["rev-parse", "FETCH_HEAD"])]);
  const apiManifest = apiClosure();
  const solidManifest = sourceClosure(TOOLING_REPO, "scripts/production-website/source-manifest.json", ["scripts/production-website/", "scripts/production-website-cutover.mjs", "package.json"]);
  assert.deepEqual(clean(TOOLING_REPO), own); assert.deepEqual(clean(API_REPO), api); assert.deepEqual(clean(APP_REPO), app);
  return { solid_tooling_source: own.source, solid_tooling_tree: own.tree, solid_tooling_manifest_sha256: solidManifest,
    api_tooling_source: api.source, api_tooling_tree: api.tree, api_tooling_manifest_sha256: apiManifest };
}

let loaded, loadedPins, verified;
/** Fixed verified import paths only. Pure CI imports never call this function. */
export async function loadApiContext() {
  const pins = verifiedSourcePins();
  if (loadedPins) assert.deepEqual(pins, loadedPins, "Release source changed within this process");
  else loadedPins = pins;
  const module = name => import(pathToFileURL(join(API_REPO, "scripts", name)).href);
  loaded ??= Promise.all([module("production-release/production-release-admission.ts"), module("production-release/production-operation-evidence.ts"),
    module("production-release/production-worker-cutover.ts"), module("production-release/production-source-binding.ts"),
    module("deploy-worker-with-provenance.ts"), module("rewards-e2e/cloudflare-api.mjs"), module("production-release/production-database-cutover.ts"),
    module("production-release/production-release-paths.ts"), module("production-release/production-managed-environment.ts")]);
  const [admission, evidence, backend, source, commands, provider, database, paths, environment] = await loaded;
  assert.equal(evidence.OPERATION_DIR, EVIDENCE_ROOT + "operation/"); assert.equal(evidence.JOURNAL_DIR, EVIDENCE_ROOT + "execution-journal/");
  assert.equal(admission.FACTS_PATH, FACTS_PATH); assert.equal(paths.WEBSITE_EXECUTOR, fileURLToPath(EXECUTOR));
  assert.equal(paths.WEBSITE_SOURCE, APP_SOURCE); assert.equal(paths.API_APP_SOURCE, API_APP_SOURCE);
  source.assertToolingSource({ tooling_source: pins.api_tooling_source, tooling_tree: pins.api_tooling_tree, adapter_manifest_sha256: pins.api_tooling_manifest_sha256 });
  verified = { pins, admission, evidence, backend, commands, provider, database, environment };
  return verified;
}

/** Already verified fixed modules; orchestration explicitly rechecks before effects. */
export function apiContext() { assert.ok(verified, "API source context has not been verified"); return verified; }

export function assertWholeSourcePins(review, pins) {
  assert.equal(review.tooling_source, pins.api_tooling_source); assert.equal(review.tooling_tree, pins.api_tooling_tree);
  assert.equal(review.adapter_manifest_sha256, pins.api_tooling_manifest_sha256);
  for (const key of ["solid_tooling_source", "solid_tooling_tree", "solid_tooling_manifest_sha256"]) assert.equal(review[key], pins[key]);
}
