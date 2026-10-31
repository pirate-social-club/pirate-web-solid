import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertPublishedWebsiteSource } from "../website-production-source-preflight.mjs";
import { websiteArtifactDigest } from "../website-production-artifacts.mjs";
import { preparedCandidate } from "./candidate.mjs";
import { bootstrapToolEnvironment } from "./context.mjs";
import { APP_REPO, APP_SOURCE, APP_TREE, NODE, TOOLING_REPO, WRANGLER_BIN } from "./paths.mjs";

const BUN = "/home/t42/.bun/bin/bun";
const API_SOURCE = "6862fa976a2fc387ee0e0274ba9f1b2abc447427";
const hash = value => createHash("sha256").update(value).digest("hex");
const git = args => execFileSync("/usr/bin/git", args, { cwd: APP_REPO, env: bootstrapToolEnvironment(), timeout: 30_000, maxBuffer: 256 * 1024 * 1024 });
const text = args => git(args).toString("utf8").trim();
const refuse = reason => { throw new Error("hns_staging_deploy_refused:" + reason); };

export function stagingSelection(args) {
  // The mandated package script supplies --deploy before explicit frozen arguments.
  if (args.length === 3 && args[0] === "--deploy"
    && ["--prepare-frozen", "--deploy-frozen", "--check-frozen-release"].includes(args[1]))
    return stagingSelection(args.slice(1));
  if (args.length === 1 && ["--deploy", "--check-only", "--check-release"].includes(args[0])) return { mode: args[0], frozen: false };
  if (args.length === 2 && ["--prepare-frozen", "--deploy-frozen", "--check-frozen-release"].includes(args[0])
    && /^\/tmp\/pirate-v1-solid-staging-[a-f0-9]{32}$/u.test(args[1])) return { mode: args[0], frozen: true, runRoot: args[1] };
  return refuse("invalid_staging_arguments");
}

/** Native mount evidence, not a caller assertion. The outer reviewed operation owns the namespace. */
export function requireReadOnlyMount(path, mountInfo) {
  const decode = value => value.replace(/\\([0-7]{3})/gu, (_, digits) => String.fromCharCode(parseInt(digits, 8)));
  const mounts = mountInfo.trim().split("\n").map(line => line.split(" ")).filter(fields => fields.length >= 7)
    .map(fields => ({ path: decode(fields[4]), options: fields[5].split(",") }))
    .filter(row => path === row.path || path.startsWith(row.path === "/" ? "/" : row.path + "/"))
    .sort((a, b) => b.path.length - a.path.length);
  assert.ok(mounts[0]?.options.includes("ro"), "Frozen staging source/dependencies require an actual read-only mount");
}

export function frozenBuildEnvironment(input = process.env, runRoot) {
  if (input.SOLID_API_NEXT_FIXTURE_ORIGIN !== undefined) refuse("fixture_api_override");
  return { ...bootstrapToolEnvironment(input), PATH: dirname(NODE) + ":" + dirname(BUN) + ":/usr/bin:/bin",
    TMPDIR: join(runRoot, "tmp"), XDG_CACHE_HOME: join(runRoot, "cache"), CLOUDFLARE_ENV: "staging",
    WRANGLER_SEND_METRICS: "false", CI: "1" };
}

function privateDirectory(path) {
  const stat = lstatSync(path);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === resolve(path));
  assert.equal(stat.uid, process.getuid()); assert.equal(stat.mode & 0o777, 0o700);
}

async function sources() {
  assert.equal(APP_SOURCE, "2df88cf0200fb30535d4d3b5b1034b390e024c51");
  assert.equal(assertPublishedWebsiteSource(APP_REPO, args => text(args)), APP_SOURCE);
  assert.equal(text(["rev-parse", "HEAD^{tree}"]), APP_TREE);
  const toolingSource = assertPublishedWebsiteSource(TOOLING_REPO, args => execFileSync("/usr/bin/git", args,
    { cwd: TOOLING_REPO, env: bootstrapToolEnvironment(), encoding: "utf8", timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }).trim());
  const mountInfo = readFileSync("/proc/self/mountinfo", "utf8");
  requireReadOnlyMount(realpathSync(APP_REPO), mountInfo);
  requireReadOnlyMount(realpathSync(join(APP_REPO, "node_modules")), mountInfo);
  if (existsSync(join(APP_REPO, "packages/solid-ui/node_modules"))) requireReadOnlyMount(realpathSync(join(APP_REPO, "packages/solid-ui/node_modules")), mountInfo);
  // This also refuses any change to the retained production receipt/artifact and uploader inputs.
  const production = await preparedCandidate();
  return { toolingSource, production, bunSha256: hash(readFileSync(BUN)) };
}

function entries() {
  return git(["ls-tree", "-rz", "--full-tree", APP_SOURCE]).toString("utf8").split("\0").filter(Boolean).map(row => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(row);
    assert.ok(match && !match[3].split("/").some(part => ["", ".", ".."].includes(part)) && !match[3].includes("\n"), "Unsupported frozen export entry");
    return { mode: match[1], oid: match[2], name: match[3] };
  });
}

function assertExport(app) {
  const tracked = entries(), names = new Set(tracked.map(row => row.name));
  for (const row of tracked) {
    const path = join(app, row.name), stat = lstatSync(path), bytes = readFileSync(path);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && realpathSync(path) === resolve(path));
    assert.equal(createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex"), row.oid, "Frozen export differs: " + row.name);
    assert.equal(Boolean(stat.mode & 0o111), row.mode === "100755");
  }
  const dependencyLinks = new Map([["node_modules", join(APP_REPO, "node_modules")]]);
  if (existsSync(join(APP_REPO, "packages/solid-ui/node_modules"))) dependencyLinks.set("packages/solid-ui/node_modules", join(APP_REPO, "packages/solid-ui/node_modules"));
  function visit(directory, prefix = "") {
    for (const name of readdirSync(directory)) {
      const relative = prefix + name, path = join(directory, name), stat = lstatSync(path);
      if (dependencyLinks.has(relative)) {
        assert.ok(stat.isSymbolicLink()); assert.equal(realpathSync(path), realpathSync(dependencyLinks.get(relative))); continue;
      }
      assert.ok(!stat.isSymbolicLink() && realpathSync(path) === resolve(path), "Foreign export link");
      if (["dist", ".wrangler", ".tmp"].includes(relative)) { assert.ok(stat.isDirectory()); continue; }
      if (stat.isDirectory()) visit(path, relative + "/");
      else assert.ok(stat.isFile() && names.has(relative), "Untracked frozen build input: " + relative);
    }
  }
  visit(app);
  for (const name of [".git", ".env", ".env.local", ".env.staging", ".dev.vars", ".dev.vars.staging"])
    assert.ok(!existsSync(join(app, name)), "Unexpected live build input: " + name);
  assert.equal(realpathSync(join(app, "node_modules")), realpathSync(join(APP_REPO, "node_modules")));
}

function run(app, command, args, environment) {
  const value = spawnSync(command, args, { cwd: app, env: environment, stdio: "inherit", timeout: 600_000 });
  if (value.error || value.status !== 0) refuse("frozen_staging_build_failed");
}

export function assertStagingConfiguration(source, config) {
  assert.equal(config.name, "pirate-web-solid-staging"); assert.equal(config.targetEnvironment, "staging");
  assert.equal(config.account_id, source.account_id); assert.deepEqual(config.vars, source.env.staging.vars);
  assert.equal(config.vars.API_NEXT_ORIGIN, "https://api-next-staging.pirate.sc");
  assert.equal(config.vars.PUBLIC_APP_CANONICAL_ORIGIN, "https://web-next-staging.pirate.sc");
  assert.equal(config.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED, "true"); assert.equal(config.vars.HNS_HANDLE_HOST_INGRESS_ENABLED, "true");
}

function checkConfiguration(app) {
  const source = JSON.parse(readFileSync(join(app, "wrangler.jsonc"), "utf8"));
  const config = JSON.parse(readFileSync(join(app, "dist/ssr/wrangler.json"), "utf8"));
  assertStagingConfiguration(source, config);
  return hash(readFileSync(join(app, "dist/ssr/wrangler.json")));
}

function save(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(path), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}

/** Creates only a fresh owned staging export. A refusal preserves it; no cleanup or overwrite. */
export async function prepareFrozenStagingBuild(runRoot) {
  stagingSelection(["--prepare-frozen", runRoot]);
  const pins = await sources();
  assert.equal(realpathSync("/tmp"), "/tmp");
  entries(); // Validate all committed entry kinds and paths before tar may create anything.
  mkdirSync(runRoot, { mode: 0o700 }); privateDirectory(runRoot);
  const app = join(runRoot, "app"); mkdirSync(app, { mode: 0o700 });
  for (const directory of ["tmp", "cache"]) mkdirSync(join(runRoot, directory), { mode: 0o700 });
  const archive = git(["archive", "--format=tar", APP_SOURCE]);
  execFileSync("/usr/bin/tar", ["--extract", "--no-same-owner", "--file=-"], { cwd: app, input: archive, timeout: 30_000, env: bootstrapToolEnvironment() });
  symlinkSync(join(APP_REPO, "node_modules"), join(app, "node_modules"));
  if (existsSync(join(APP_REPO, "packages/solid-ui/node_modules")))
    symlinkSync(join(APP_REPO, "packages/solid-ui/node_modules"), join(app, "packages/solid-ui/node_modules"));
  assertExport(app);
  const environment = frozenBuildEnvironment(process.env, runRoot);
  run(app, BUN, ["--no-env-file", "run", "prebuild"], environment);
  // Runner avoids Vite's default node_modules/.vite-temp config bundle write to qualified dependencies.
  run(app, NODE, [join(app, "node_modules/vite/bin/vite.js"), "build", "--configLoader", "runner"], environment);
  run(app, NODE, ["scripts/prune-solid-ssr-optional-assets.mjs"], environment);
  assertExport(app);
  const configSha = checkConfiguration(app), artifactSha = await websiteArtifactDigest(app);
  assert.notEqual(artifactSha, pins.production.artifact_sha256);
  const after = await sources(); assert.deepEqual(after, pins);
  save(join(runRoot, "staging-prepared.json"), { kind: "pirate-frozen-staging-prepared-v1", source: APP_SOURCE, tree: APP_TREE,
    tooling_source: pins.toolingSource, run_root: runRoot, artifact_sha256: artifactSha, config_sha256: configSha,
    retained_production_artifact_sha256: pins.production.artifact_sha256, retained_production_receipt_sha256: pins.production.receipt_sha256,
    uploader_sha256: pins.production.uploader_sha256, bun_sha256: pins.bunSha256, target_api_source: API_SOURCE, target_api_source_is_observed: false,
    build_configuration_loader: "runner", installed: false });
  return readFrozenStagingBuild(runRoot);
}

/** Rechecks prepared bytes and both accepted source identities before every guarded upload. */
export async function readFrozenStagingBuild(runRoot) {
  stagingSelection(["--deploy-frozen", runRoot]); privateDirectory(runRoot);
  const app = join(runRoot, "app"); privateDirectory(app); const pins = await sources(); assertExport(app);
  const path = join(runRoot, "staging-prepared.json"), stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600);
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(receipt.kind, "pirate-frozen-staging-prepared-v1"); assert.equal(receipt.run_root, runRoot);
  assert.equal(receipt.source, APP_SOURCE); assert.equal(receipt.tree, APP_TREE); assert.equal(receipt.tooling_source, pins.toolingSource);
  assert.equal(receipt.config_sha256, checkConfiguration(app)); assert.equal(receipt.artifact_sha256, await websiteArtifactDigest(app));
  assert.equal(receipt.retained_production_artifact_sha256, pins.production.artifact_sha256);
  assert.equal(receipt.retained_production_receipt_sha256, pins.production.receipt_sha256);
  assert.equal(receipt.bun_sha256, pins.bunSha256);
  assert.equal(receipt.uploader_sha256, pins.production.uploader_sha256); assert.equal(receipt.target_api_source, API_SOURCE);
  assert.equal(receipt.target_api_source_is_observed, false); assert.equal(receipt.installed, false);
  return { app, source: APP_SOURCE, receipt, node: NODE, wrangler: WRANGLER_BIN, environment: frozenBuildEnvironment(process.env, runRoot) };
}
