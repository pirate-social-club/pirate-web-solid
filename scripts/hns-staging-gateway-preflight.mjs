import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  readStagingIngressCompositionInputs,
  stagingIngressCompositionIdentity,
} from "./hns-ingress-composition-identity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const gatewayHost = "ubuntu@81.15.150.167";
const manifestPath = "/srv/pirate-hns-staging/public-gateway/current/deployment-manifest.json";
const gatewayPrefix = "hns-community-app-handle-gateway-sha256:";

function refuse(reason) {
  throw new Error(`hns_staging_deploy_refused:${reason}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    refuse(`invalid_${label}`);
  }
}

export function checkStagingGatewayCandidate({ sourceConfig, builtConfig, manifestBytes, fingerprint }) {
  const manifest = readJson(manifestBytes, "gateway_manifest");
  if (manifest.schema !== "pirate-hns-community-app-handle-gateway-staging-public-v1"
    || manifest.mode !== "staging-public-tls"
    || manifest.solid_origin !== "https://hns-community-ingress-staging.pirate.sc") {
    refuse("gateway_manifest_is_not_staging");
  }
  if (manifest.solid_ingress_composition_reference !== fingerprint) {
    refuse("gateway_fingerprint_differs_from_candidate");
  }
  const reference = `${gatewayPrefix}${sha256(manifestBytes)}`;
  const sourceVars = sourceConfig?.env?.staging?.vars;
  const builtVars = builtConfig?.vars;
  if (builtConfig?.name !== "pirate-web-solid-staging") refuse("built_worker_is_not_staging");
  for (const vars of [sourceVars, builtVars]) {
    if (vars?.HNS_COMMUNITY_APP_INGRESS_ENABLED !== "true"
      || vars?.HNS_HANDLE_HOST_INGRESS_ENABLED !== "true"
      || vars?.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE !== reference
      || vars?.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE !== reference
      || vars?.HNS_COMMUNITY_APP_INGRESS_ORIGIN !== manifest.solid_origin
      || vars?.HNS_HANDLE_HOST_INGRESS_ORIGIN !== manifest.solid_origin) {
      refuse("worker_bindings_differ_from_active_gateway");
    }
  }
  return { gatewayReference: reference, fingerprint };
}

export async function checkLiveStagingGateway() {
  const manifestBytes = execFileSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes",
    gatewayHost, "cat", manifestPath,
  ], { timeout: 15_000, maxBuffer: 65_536, stdio: ["ignore", "pipe", "pipe"] });
  const { config, sources, packageJson } = await readStagingIngressCompositionInputs(root);
  const fingerprint = stagingIngressCompositionIdentity(config, sources, packageJson);
  const builtConfig = readJson(await readFile(new URL("../dist/ssr/wrangler.json", import.meta.url)), "built_config");
  return checkStagingGatewayCandidate({ sourceConfig: config, builtConfig, manifestBytes, fingerprint });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) refuse("unexpected_argument");
  try {
    const result = await checkLiveStagingGateway();
    console.log(JSON.stringify({ event: "hns_staging_gateway_preflight_passed", ...result }));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("hns_staging_deploy_refused:")
      ? error.message : "hns_staging_deploy_refused:gateway_read_or_candidate_check_failed");
    process.exitCode = 1;
  }
}
