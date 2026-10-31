import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkLiveStagingGateway } from "./hns-staging-gateway-preflight.mjs";
import { checkStagingRelease } from "./staging-release-check.mjs";
import { prepareFrozenStagingBuild, readFrozenStagingBuild, stagingSelection } from "./production-website/staging-build-isolation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
// The repository pins its Playwright browsers in .playwright-browsers. Export
// the path for the generated test processes so deploys do not depend on the
// operator's ambient cache.
{
  const pinned = join(root, ".playwright-browsers");
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(pinned)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = pinned;
  }
}

const expectedRemote = "https://github.com/pirate-social-club/pirate-web-solid.git";
const stagingFixture = {
  E2E_BASE_URL: "https://web-next-staging.pirate.sc",
  E2E_HNS_ROOT: "8s28",
  E2E_HNS_COMMUNITY_ID: "community_05833acf-710f-4b6e-b1f1-9e3da59dc11f",
  E2E_HNS_SESSION_ID: "hns-root-import_84639ca2-a53f-401c-8fad-c223c659fd43",
  E2E_HNS_COMMUNITY_NAME: "E2E HNS 8s28 Staging Retry 2026-09-27T23:16",
};

function refuse(reason) {
  throw new Error(`hns_staging_deploy_refused:${reason}`);
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 30_000,
    maxBuffer: 65_536, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function run(command, args, env = process.env, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, env, stdio: "inherit", timeout: 600_000,
  });
  if (result.error || result.status !== 0) refuse(`${command}_failed`);
}

function assertPublishedMain() {
  if (output("git", ["branch", "--show-current"]) !== "main") refuse("source_is_not_main");
  if (output("git", ["status", "--porcelain=v1"])) refuse("source_is_dirty");
  if (output("git", ["remote", "get-url", "origin"]) !== expectedRemote) refuse("unexpected_origin");
  const sha = output("git", ["rev-parse", "HEAD"]);
  const remote = output("git", ["ls-remote", "origin", "refs/heads/main"]).split("\t")[0];
  if (!/^[0-9a-f]{40}$/u.test(remote) || remote !== sha) refuse("source_is_not_published_main");
  return sha;
}

async function main() {
  const selection = stagingSelection(process.argv.slice(2));
  let stage;
  if (selection.frozen) stage = selection.mode === "--prepare-frozen"
    ? await prepareFrozenStagingBuild(selection.runRoot) : await readFrozenStagingBuild(selection.runRoot);
  const operationRoot = stage?.app ?? root;
  const environment = stage?.environment ?? process.env;
  const deploy = selection.mode === "--deploy" || selection.mode === "--deploy-frozen";
  const sha = stage?.source ?? (deploy ? assertPublishedMain() : output("git", ["rev-parse", "HEAD"]));
  if (selection.mode === "--deploy") run("bun", ["run", "build"], { ...process.env, CLOUDFLARE_ENV: "staging" });
  // Frozen source is exported and hash-checked before this exact source-owned preflight is imported.
  const gateway = stage ? (await import(pathToFileURL(join(operationRoot, "scripts/hns-staging-gateway-preflight.mjs")).href)).checkLiveStagingGateway
    : checkLiveStagingGateway;
  const first = await gateway();
  console.log(JSON.stringify({ event: "hns_staging_preflight", sha, ...first }));
  if (selection.mode === "--prepare-frozen") {
    console.log(JSON.stringify({ event: "frozen_staging_prepared", sha, artifact_sha256: stage.receipt.artifact_sha256,
      config_sha256: stage.receipt.config_sha256, installed: false }));
    return;
  }
  if (deploy) {
    const wrangler = stage ? args => run(stage.node, [stage.wrangler, ...args], environment, operationRoot)
      : args => run("bunx", ["wrangler", ...args]);
    wrangler(["deploy", "--dry-run", "--config", "dist/ssr/wrangler.json"]);
    if (stage) await readFrozenStagingBuild(selection.runRoot);
    // Re-read the active gateway just before mutation. A gateway switch after
    // build must not silently invalidate the candidate Worker.
    await gateway();
    wrangler(["deploy", "--config", "dist/ssr/wrangler.json", "--message", `staging HNS guard ${sha}`]);
  }
  const serving = await checkStagingRelease({
    requireHns: selection.mode === "--check-only",
    report: value => console.log(JSON.stringify(value)),
    hnsCheck: () => {
      run("python3", ["scripts/hns-staging-serving-check.py"], environment, operationRoot);
      run("infisical", ["run", "--projectId=fac45f92-9450-42fb-8c2f-f20d043fdfab",
        "--env=staging", "--path=/services/api-next", "--path=/services/api-next/operator",
        "--silent", "--", "node", "scripts/run-hns-mainnet-route.mjs"],
        { ...environment, ...stagingFixture }, operationRoot);
    },
  });
  if (stage) await readFrozenStagingBuild(selection.runRoot);
  console.log(JSON.stringify({ event: deploy ? "staging_deploy_accepted" : "staging_check_passed", sha, ...serving,
    ...(stage ? { staging_artifact_sha256: stage.receipt.artifact_sha256 } : {}) }));
}

main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("hns_staging_deploy_refused:")
    ? error.message : "hns_staging_deploy_refused:preflight_or_serving_check_failed");
  process.exitCode = 1;
});
