import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLiveStagingGateway } from "./hns-staging-gateway-preflight.mjs";

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

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root, env, stdio: "inherit", timeout: 600_000,
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
  if (process.argv.length !== 3 || !["--check-only", "--deploy"].includes(process.argv[2])) {
    refuse("usage_deploy_staging_with_hns_guard_--check-only_or_--deploy");
  }
  const deploy = process.argv[2] === "--deploy";
  const sha = deploy ? assertPublishedMain() : output("git", ["rev-parse", "HEAD"]);
  if (deploy) run("bun", ["run", "build"], { ...process.env, CLOUDFLARE_ENV: "staging" });
  const first = await checkLiveStagingGateway();
  console.log(JSON.stringify({ event: "hns_staging_preflight", sha, ...first }));
  if (deploy) {
    run("bunx", ["wrangler", "deploy", "--dry-run", "--config", "dist/ssr/wrangler.json"]);
    // Re-read the active gateway just before mutation. A gateway switch after
    // build must not silently invalidate the candidate Worker.
    await checkLiveStagingGateway();
    run("bunx", ["wrangler", "deploy", "--config", "dist/ssr/wrangler.json",
      "--message", `staging HNS guard ${sha}`]);
  }
  run("python3", ["scripts/hns-staging-serving-check.py"]);
  run("infisical", ["run", "--projectId=fac45f92-9450-42fb-8c2f-f20d043fdfab",
    "--env=staging", "--path=/services/api-next", "--path=/services/api-next/operator",
    "--silent", "--", "node", "scripts/run-hns-mainnet-route.mjs"],
  { ...process.env, ...stagingFixture });
  console.log(JSON.stringify({ event: deploy ? "hns_staging_deploy_accepted" : "hns_staging_check_passed", sha }));
}

main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("hns_staging_deploy_refused:")
    ? error.message : "hns_staging_deploy_refused:preflight_or_serving_check_failed");
  process.exitCode = 1;
});
