import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertPostingPostcheckBrowser, assertPostingReceipt, assertPostingSourceIdentity, assertPostingWorkspaceIdentity, POSTING, postingGatewayGate, postingManifest, postingPostcheckEnvironment, qualifyPostingStagingCandidate } from "./posting-staging.mjs";
import { assertStagingExport, stagingSelection } from "./staging-build-isolation.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const runRoot = "/tmp/pirate-posting-staging-" + "a".repeat(32);

test("posting actions have a distinct fixed namespace and keep the package script prefix", () => {
  for (const mode of ["--prepare-posting-frozen", "--deploy-posting-frozen", "--check-posting-frozen-release"]) {
    const expected = { mode, frozen: true, posting: true, runRoot };
    assert.deepEqual(stagingSelection([mode, runRoot]), expected);
    assert.deepEqual(stagingSelection(["--deploy", mode, runRoot]), expected);
    assert.throws(() => stagingSelection([mode, runRoot.replace("posting", "v1-solid")]));
    assert.throws(() => stagingSelection([mode, runRoot, "--source", "other"]));
  }
});

test("source policy requires the exact published accepted app rather than current tooling HEAD", () => {
  const proof = { source: POSTING.source, tree: POSTING.tree, published: POSTING.source, acceptedMainAncestor: true };
  assertPostingSourceIdentity(proof);
  for (const change of [{ source: "a".repeat(40) }, { tree: "b".repeat(40) }, { published: "c".repeat(40) }, { acceptedMainAncestor: false }])
    assert.throws(() => assertPostingSourceIdentity({ ...proof, ...change }));
});

test("future manifest is the exact reviewed native recipe and rejects changed bytes", () => {
  const bytes = postingManifest();
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.bundle_sha256, POSTING.nativeBundle);
  assert.equal(manifest.solid_ingress_composition_reference, POSTING.ingress);
  for (const change of [{ bundle_sha256: "f".repeat(64) }, { profile_version: "old" }, { solid_ingress_composition_reference: "other" }])
    assert.throws(() => postingManifest(Buffer.from(JSON.stringify({ ...manifest, ...change }))));
  assert.throws(() => postingManifest(Buffer.concat([bytes, Buffer.from("\n")])));
});

test("unchanged dependency manifests cannot admit the later main workspace UI", () => {
  const git = args => execFileSync("git", args, { cwd: repository });
  const later = "3225218090d0d00f7fe330d645bd8cd02d3e2ccf";
  for (const name of ["package.json", "bun.lock", "packages/solid-ui/package.json", "vendor/api-client-provenance.json"])
    assert.deepEqual(git(["show", POSTING.source + ":" + name]), git(["show", later + ":" + name]));
  const selectedTree = git(["rev-parse", POSTING.source + ":packages/solid-ui"]).toString().trim();
  const laterTree = git(["rev-parse", later + ":packages/solid-ui"]).toString().trim();
  assert.notEqual(selectedTree, laterTree);
  const proof = { selectedTree, actualTree: selectedTree, resolvedPackage: "/qualified/packages/solid-ui", workspacePackage: "/qualified/packages/solid-ui" };
  assertPostingWorkspaceIdentity(proof);
  assert.throws(() => assertPostingWorkspaceIdentity({ ...proof, actualTree: laterTree }), /differs from selected/u);
  assert.throws(() => assertPostingWorkspaceIdentity({ ...proof, resolvedPackage: "/other/packages/solid-ui" }), /outside/u);
});

test("offline preparation never reads live state; deployment and checking always do", async () => {
  const calls = [];
  const offline = () => { calls.push("offline"); return { installed: false, observedLive: false }; };
  const live = () => { calls.push("live"); throw new Error("live gateway mismatch"); };
  assert.deepEqual(await postingGatewayGate("--prepare-posting-frozen", offline, live), { installed: false, observedLive: false });
  for (const mode of ["--deploy-posting-frozen", "--check-posting-frozen-release"])
    await assert.rejects(postingGatewayGate(mode, offline, live), /live gateway mismatch/u);
  assert.deepEqual(calls, ["offline", "live", "live"]);
});

test("receipt cannot replace source, inputs, artifact, future gateway or observation claims", () => {
  const expected = { runRoot, inputs: { toolingSource: "a".repeat(40), dependencies: { client: "genuine142" } }, artifact: "b".repeat(64), config: "c".repeat(64) };
  const valid = { kind: "pirate-fixed-posting-staging-v1", source: POSTING.source, tree: POSTING.tree, runRoot,
    inputs: expected.inputs, artifact_sha256: expected.artifact, config_sha256: expected.config, futureGateway: POSTING.gateway, installed: false, observedLive: false };
  assertPostingReceipt(valid, expected);
  for (const change of [{ source: "other" }, { tree: "other" }, { runRoot: "other" }, { inputs: { ...expected.inputs, dependencies: {} } },
    { artifact_sha256: "other" }, { config_sha256: "other" }, { futureGateway: "other" }, { installed: true }, { observedLive: true }, { extraOverride: "forbidden" }])
    assert.throws(() => assertPostingReceipt({ ...valid, ...change }, expected));
});

test("postchecks keep the fixed pinned browser in the exact probed child environment", () => {
  const build = { PATH: "/qualified/bin", HOME: "/fixture/home" };
  const env = postingPostcheckEnvironment(build);
  assert.equal(build.PLAYWRIGHT_BROWSERS_PATH, undefined);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, join(repository, ".playwright-browsers"));
  let called = false;
  assertPostingPostcheckBrowser(env, (_node, _args, options) => { called = true; assert.equal(options.env, env); });
  assert.equal(called, true);
  assert.throws(() => assertPostingPostcheckBrowser({ ...env, PLAYWRIGHT_BROWSERS_PATH: "/ambient/browser" }, () => assert.fail("must refuse before probe")));
  assert.throws(() => assertPostingPostcheckBrowser(env, () => { throw new Error("missing qualified browser"); }), /missing qualified browser/u);
});

test("actual selected app export qualifies offline, rejects dependency/export/env and built gateway tampering", async () => {
  const app = mkdtempSync(join(tmpdir(), "posting-export-test-"));
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", POSTING.source], { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
    execFileSync("tar", ["--extract", "--file=-"], { cwd: app, input: archive });
    symlinkSync(join(repository, "node_modules"), join(app, "node_modules"));
    if (readFileSync(join(app, "packages/solid-ui/package.json"))) {
      symlinkSync(join(repository, "packages/solid-ui/node_modules"), join(app, "packages/solid-ui/node_modules"));
    }
    assertStagingExport(app, repository, POSTING.source);
    const source = JSON.parse(readFileSync(join(app, "wrangler.jsonc"), "utf8"));
    const built = { ...source.env.staging, account_id: source.account_id, name: "pirate-web-solid-staging", targetEnvironment: "staging" };
    mkdirSync(join(app, "dist/ssr"), { recursive: true });
    const configPath = join(app, "dist/ssr/wrangler.json"); writeFileSync(configPath, JSON.stringify(built));
    const result = await qualifyPostingStagingCandidate({ app });
    assert.equal(result.installed, false); assert.equal(result.observedLive, false);
    assert.equal(result.gatewayReference, "hns-community-app-handle-gateway-sha256:" + POSTING.gateway);
    writeFileSync(configPath, JSON.stringify({ ...built, vars: { ...built.vars, HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE: "other" } }));
    await assert.rejects(qualifyPostingStagingCandidate({ app }), /worker_bindings_differ/u);
    writeFileSync(configPath, JSON.stringify(built));
    const dependency = join(app, "vendor/api-client-provenance.json"), original = readFileSync(dependency);
    writeFileSync(dependency, Buffer.concat([original, Buffer.from("\n")]));
    assert.throws(() => assertStagingExport(app, repository, POSTING.source)); writeFileSync(dependency, original);
    writeFileSync(join(app, ".env"), "FORBIDDEN=fixture"); assert.throws(() => assertStagingExport(app, repository, POSTING.source)); unlinkSync(join(app, ".env"));
    unlinkSync(join(app, "node_modules")); symlinkSync(tmpdir(), join(app, "node_modules"));
    assert.throws(() => assertStagingExport(app, repository, POSTING.source));
  } finally { rmSync(app, { recursive: true, force: true }); }
});
