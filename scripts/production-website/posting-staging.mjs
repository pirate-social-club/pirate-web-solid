import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { websiteArtifactDigest } from "../website-production-artifacts.mjs";
import { assertPublishedWebsiteSource } from "../website-production-source-preflight.mjs";
import { assertPreparedReceipt } from "../production-website-hotfix.mjs";
import { bootstrapToolEnvironment } from "./context.mjs";
import { assertStagingExport, checkStagingBuildConfiguration, frozenBuildEnvironment, privateDirectory, requireReadOnlyMount, runStagingBuild, saveStagingReceipt, stagingSelection, stagingSourceEntries } from "./staging-build-isolation.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const NODE = "/home/t42/.nvm/versions/node/v24.14.0/bin/node";
const BUN = "/home/t42/.bun/bin/bun";
export const POSTING = Object.freeze({
  source: "2c4cffe9c4e82e359de2957d06efc27a9cbfa5cf",
  tree: "fa2d333ebd5a579c666c801dbd9e46159a300c62",
  productionArtifact: "2f2752a76ab0e9b0f52def71bd7e7928311f582e7041e41bc425532b7dd9511b",
  productionReceipt: "beb7174f296a67a792d83d24e75360c0e2143d1fae5e9e2bbc4e96eb11827db1",
  gateway: "34f51467e42481bf829e774943a63860bf8946f755fb5b73a5727f455c19204c",
  ingress: "solid-hns-ingress-sha256:ca8947f90135419945ed697af91e429bc07b45e04d8ace973f655fe6f37758f5",
  nativeBundle: "34029a3cf81dda85a7f9fc6eed3d9655be08a930fb17db3f1497b7618fe72a24",
});
const retained = join(ROOT, ".tmp/build/posting-staging-production-2c4");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const environment = () => bootstrapToolEnvironment();
const git = args => execFileSync("/usr/bin/git", args, { cwd: ROOT, env: environment(), timeout: 30_000, maxBuffer: 256 * 1024 * 1024 });
const text = args => git(args).toString("utf8").trim();

export function assertPostingSourceIdentity(value) {
  assert.equal(value.source, POSTING.source); assert.equal(value.tree, POSTING.tree);
  assert.equal(value.published, POSTING.source); assert.equal(value.acceptedMainAncestor, true);
}

export function assertPostingWorkspaceIdentity(value) {
  assert.equal(value.actualTree, value.selectedTree, "Resolved workspace source differs from selected posting tree");
  assert.equal(value.resolvedPackage, value.workspacePackage, "Workspace dependency resolves outside the qualified source");
}

export function postingManifest(bytes = readFileSync(new URL("posting-staging-gateway.json", import.meta.url))) {
  assert.equal(sha(bytes), POSTING.gateway, "Posting manifest differs from the reviewed future gateway");
  const value = JSON.parse(bytes.toString("utf8"));
  assert.equal(JSON.stringify(value), bytes.toString("utf8"));
  assert.equal(value.bundle_sha256, POSTING.nativeBundle);
  assert.equal(value.solid_ingress_composition_reference, POSTING.ingress);
  assert.equal(value.profile_version, "pirate-hns-community-app-interactive-gateway-v4");
  return bytes;
}

/** Preparation proves only candidate compatibility; every deploy/check must read live state. */
export async function postingGatewayGate(mode, offline, live) {
  return mode === "--prepare-posting-frozen" ? offline() : live();
}

/** The browser selector belongs to postchecks, never the sanitized build. */
export function postingPostcheckEnvironment(buildEnvironment) {
  return { ...buildEnvironment, PLAYWRIGHT_BROWSERS_PATH: join(ROOT, ".playwright-browsers") };
}

export function assertPostingPostcheckBrowser(env, run = execFileSync) {
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, join(ROOT, ".playwright-browsers"));
  run(NODE, ["--input-type=module", "-e",
    "import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {chromium} from 'playwright';assert.ok(existsSync(chromium.executablePath()),'Qualified posting postcheck browser is missing');"],
  { cwd: ROOT, env, timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
}

export function assertPostingReceipt(receipt, expected) {
  assert.deepEqual(Object.keys(receipt).sort(), ["kind", "source", "tree", "runRoot", "inputs", "artifact_sha256", "config_sha256", "futureGateway", "installed", "observedLive"].sort());
  assert.equal(receipt.kind, "pirate-fixed-posting-staging-v1"); assert.equal(receipt.runRoot, expected.runRoot);
  assert.equal(receipt.source, POSTING.source); assert.equal(receipt.tree, POSTING.tree);
  assert.deepEqual(receipt.inputs, expected.inputs); assert.equal(receipt.futureGateway, POSTING.gateway);
  assert.equal(receipt.installed, false); assert.equal(receipt.observedLive, false);
  assert.equal(receipt.config_sha256, expected.config); assert.equal(receipt.artifact_sha256, expected.artifact);
}

async function inputs() {
  const toolingSource = assertPublishedWebsiteSource(ROOT);
  const accepted = spawnSync("/usr/bin/git", ["merge-base", "--is-ancestor", POSTING.source, "origin/main"], { cwd: ROOT, env: environment() });
  assertPostingSourceIdentity({ source: text(["rev-parse", POSTING.source]), tree: text(["rev-parse", POSTING.source + "^{tree}"]),
    published: text(["ls-remote", "origin", "refs/heads/release/production-membership-diagnostics-20261103"]).split("\t")[0], acceptedMainAncestor: accepted.status === 0 });
  const mountInfo = readFileSync("/proc/self/mountinfo", "utf8");
  requireReadOnlyMount(realpathSync(ROOT), mountInfo);
  requireReadOnlyMount(realpathSync(join(ROOT, "node_modules")), mountInfo);
  if (existsSync(join(ROOT, "packages/solid-ui/node_modules"))) requireReadOnlyMount(realpathSync(join(ROOT, "packages/solid-ui/node_modules")), mountInfo);
  const dependencies = {};
  for (const name of ["package.json", "bun.lock", "packages/solid-ui/package.json", "vendor/api-client-provenance.json"]) {
    const bytes = readFileSync(join(ROOT, name));
    assert.deepEqual(bytes, git(["show", POSTING.source + ":" + name]), "Posting dependency input changed: " + name);
    dependencies[name] = sha(bytes);
  }
  const provenance = JSON.parse(readFileSync(join(ROOT, "vendor/api-client-provenance.json"), "utf8"));
  assert.equal(provenance.version, "0.142.0");
  assert.equal(sha(readFileSync(join(ROOT, provenance.artifact))), provenance.sha256);
  dependencies.clientArtifact = provenance.sha256;
  const workspace = {
    selectedTree: text(["rev-parse", POSTING.source + ":packages/solid-ui"]),
    actualTree: text(["rev-parse", "HEAD:packages/solid-ui"]),
    resolvedPackage: realpathSync(join(ROOT, "node_modules/@pirate/web-solid-ui")),
    workspacePackage: realpathSync(join(ROOT, "packages/solid-ui")),
  };
  assertPostingWorkspaceIdentity(workspace);
  const receipt = readFileSync(join(retained, "dist/website-production-prepared.json"));
  assert.equal(sha(receipt), POSTING.productionReceipt);
  assertPreparedReceipt(JSON.parse(receipt.toString("utf8")), { source: POSTING.source, artifact: POSTING.productionArtifact });
  assert.equal(await websiteArtifactDigest(retained), POSTING.productionArtifact);
  postingManifest();
  return { toolingSource, dependencies, workspace, bun: sha(readFileSync(BUN)), uploader: sha(readFileSync(join(ROOT, "node_modules/wrangler/wrangler-dist/cli.js"))) };
}

function configuration(app) {
  checkStagingBuildConfiguration(app);
  const source = JSON.parse(readFileSync(join(app, "wrangler.jsonc"), "utf8"));
  assert.equal(source.account_id, "08a4c22cf52e2ecae883e36f80a33f4a");
  return sha(readFileSync(join(app, "dist/ssr/wrangler.json")));
}

/** Uses the selected app's own fingerprint code after the complete export has been checked. */
export async function qualifyPostingStagingCandidate(stage) {
  assertStagingExport(stage.app, ROOT, POSTING.source);
  const identity = await import(pathToFileURL(join(stage.app, "scripts/hns-ingress-composition-identity.mjs")).href);
  const preflight = await import(pathToFileURL(join(stage.app, "scripts/hns-staging-gateway-preflight.mjs")).href);
  const { config, sources, packageJson } = await identity.readStagingIngressCompositionInputs(stage.app);
  const fingerprint = identity.stagingIngressCompositionIdentity(config, sources, packageJson);
  assert.equal(fingerprint, POSTING.ingress);
  const result = preflight.checkStagingGatewayCandidate({ sourceConfig: config,
    builtConfig: JSON.parse(readFileSync(join(stage.app, "dist/ssr/wrangler.json"), "utf8")), manifestBytes: postingManifest(), fingerprint });
  return { ...result, observedLive: false, installed: false };
}

export async function preparePostingStagingBuild(runRoot) {
  stagingSelection(["--prepare-posting-frozen", runRoot]);
  const before = await inputs();
  stagingSourceEntries(ROOT, POSTING.source);
  assert.equal(realpathSync("/tmp"), "/tmp");
  mkdirSync(runRoot, { mode: 0o700 }); privateDirectory(runRoot);
  const app = join(runRoot, "app"); mkdirSync(app, { mode: 0o700 });
  for (const name of ["tmp", "cache"]) mkdirSync(join(runRoot, name), { mode: 0o700 });
  execFileSync("/usr/bin/tar", ["--extract", "--no-same-owner", "--file=-"], { cwd: app,
    input: git(["archive", "--format=tar", POSTING.source]), env: environment(), timeout: 30_000 });
  symlinkSync(join(ROOT, "node_modules"), join(app, "node_modules"));
  if (existsSync(join(ROOT, "packages/solid-ui/node_modules"))) symlinkSync(join(ROOT, "packages/solid-ui/node_modules"), join(app, "packages/solid-ui/node_modules"));
  assertStagingExport(app, ROOT, POSTING.source);
  const env = frozenBuildEnvironment(process.env, runRoot);
  runStagingBuild(app, BUN, ["--no-env-file", "run", "prebuild"], env);
  runStagingBuild(app, NODE, [join(app, "node_modules/vite/bin/vite.js"), "build", "--configLoader", "runner"], env);
  runStagingBuild(app, NODE, ["scripts/prune-solid-ssr-optional-assets.mjs"], env);
  assertStagingExport(app, ROOT, POSTING.source);
  const config = configuration(app), artifact = await websiteArtifactDigest(app);
  const stage = { app, source: POSTING.source };
  await qualifyPostingStagingCandidate(stage);
  assert.notEqual(artifact, POSTING.productionArtifact);
  assert.deepEqual(await inputs(), before);
  saveStagingReceipt(join(runRoot, "staging-prepared.json"), { kind: "pirate-fixed-posting-staging-v1", source: POSTING.source,
    tree: POSTING.tree, runRoot, inputs: before, artifact_sha256: artifact, config_sha256: config, futureGateway: POSTING.gateway, installed: false, observedLive: false });
  return readPostingStagingBuild(runRoot);
}

export async function readPostingStagingBuild(runRoot) {
  stagingSelection(["--deploy-posting-frozen", runRoot]); privateDirectory(runRoot);
  const app = join(runRoot, "app"); privateDirectory(app);
  const pins = await inputs(); assertStagingExport(app, ROOT, POSTING.source);
  const receiptPath = join(runRoot, "staging-prepared.json"), stat = lstatSync(receiptPath);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600);
  assert.equal(realpathSync(receiptPath), receiptPath);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  assertPostingReceipt(receipt, { runRoot, inputs: pins, config: configuration(app), artifact: await websiteArtifactDigest(app) });
  const stage = { app, source: POSTING.source, receipt, node: NODE,
    wrangler: join(ROOT, "node_modules/wrangler/bin/wrangler.js"), environment: frozenBuildEnvironment(process.env, runRoot) };
  await qualifyPostingStagingCandidate(stage);
  return stage;
}
