import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  productionIngressCompositionIdentity,
  readIngressCompositionInputs,
} from "./hns-ingress-composition-identity.mjs";
import {
  checkLiveProductionGateway,
  checkProductionGatewayCandidate,
} from "./hns-production-gateway-preflight.mjs";
import { assertPublishedProductionSource } from "./hns-production-source-preflight.mjs";

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

const preparedPath = fileURLToPath(new URL("../dist/hns-production-prepared.json", import.meta.url));

function refuse(reason) {
  throw new Error("hns_production_deploy_refused:" + reason);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root, env, stdio: "inherit", timeout: 600_000,
  });
  if (result.error || result.status !== 0) refuse(command + "_failed");
}

async function buildDigest() {
  const hash = createHash("sha256");
  let count = 0;
  async function visit(directory, relative) {
    for (const entry of (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const name = relative + "/" + entry.name;
      if (entry.isSymbolicLink()) refuse("symlinked_build_artifact");
      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), name);
      } else if (entry.isFile()) {
        const bytes = await readFile(join(directory, entry.name));
        hash.update(name + "\0" + bytes.length + "\0");
        hash.update(bytes);
        count += 1;
      } else {
        refuse("unsupported_build_artifact");
      }
    }
  }
  await visit(join(root, "dist", "ssr"), "ssr");
  await visit(join(root, "dist", "client"), "client");
  if (count === 0) refuse("empty_build");
  return hash.digest("hex");
}

async function prepare(manifestPath) {
  if (!isAbsolute(manifestPath)) refuse("candidate_manifest_must_be_absolute");
  const sha = assertPublishedProductionSource(root);
  run("bun", ["run", "build"], { ...process.env, CLOUDFLARE_ENV: "production" });
  const manifestBytes = await readFile(manifestPath);
  const { config, sources, packageJson } = await readIngressCompositionInputs(root);
  const fingerprint = productionIngressCompositionIdentity(config, sources, packageJson);
  const builtConfig = JSON.parse(await readFile(join(root, "dist/ssr/wrangler.json"), "utf8"));
  const candidate = checkProductionGatewayCandidate({
    sourceConfig: config,
    builtConfig,
    manifestBytes,
    fingerprint,
  });
  run("bunx", ["wrangler", "deploy", "--dry-run", "--config", "dist/ssr/wrangler.json"]);
  const buildSha256 = await buildDigest();
  await writeFile(preparedPath, JSON.stringify({
    version: 1, sourceSha: sha, buildSha256,
    gatewayReference: candidate.gatewayReference, fingerprint,
  }) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ event: "hns_production_worker_prepared", sha, ...candidate, buildSha256 }));
}

async function deploy() {
  const sha = assertPublishedProductionSource(root);
  const prepared = JSON.parse(await readFile(preparedPath, "utf8"));
  if (prepared.version !== 1 || prepared.sourceSha !== sha
    || prepared.buildSha256 !== await buildDigest()) {
    refuse("prepared_build_or_source_changed");
  }
  const first = await checkLiveProductionGateway();
  if (prepared.gatewayReference !== first.gatewayReference
    || prepared.fingerprint !== first.fingerprint) {
    refuse("active_gateway_differs_from_prepared_candidate");
  }
  const second = await checkLiveProductionGateway();
  if (second.gatewayReference !== first.gatewayReference
    || second.fingerprint !== first.fingerprint) {
    refuse("gateway_changed_before_deploy");
  }
  run("bunx", ["wrangler", "deploy", "--config", "dist/ssr/wrangler.json",
    "--message", "production HNS guard " + sha]);
  console.log(JSON.stringify({ event: "hns_production_worker_deployed", sha, ...second }));
}

async function main() {
  if (process.argv[2] === "--prepare" && process.argv.length === 4) {
    await prepare(process.argv[3]);
  } else if (process.argv[2] === "--deploy" && process.argv.length === 3) {
    await deploy();
  } else {
    refuse("usage_--prepare_ABSOLUTE_MANIFEST_or_--deploy");
  }
}

main().catch((error) => {
  console.error(error instanceof Error && error.message.startsWith("hns_production_deploy_refused:")
    ? error.message : "hns_production_deploy_refused:preparation_or_deployment_failed");
  process.exitCode = 1;
});
