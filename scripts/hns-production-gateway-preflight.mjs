import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  productionIngressCompositionIdentity,
  readIngressCompositionInputs,
} from "./hns-ingress-composition-identity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const gatewayHost = "ubuntu@94.103.168.161";
const manifestPath = "/srv/pirate-hns-community-app-gateway/current/deployment-manifest.json";
const gatewayPrefix = "hns-community-app-handle-gateway-sha256:";
const productionOrigin = "https://hns-community-ingress.pirate.sc";

function refuse(reason) {
  throw new Error("hns_production_deploy_refused:" + reason);
}

function readJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    refuse("invalid_" + label);
  }
}

export function checkProductionGatewayCandidate({
  sourceConfig,
  builtConfig,
  manifestBytes,
  fingerprint,
}) {
  const manifest = readJson(manifestBytes, "gateway_manifest");
  if (manifest.schema !== "pirate-hns-community-app-handle-gateway-deployment-v1"
    || manifest.solid_origin !== productionOrigin
    || manifest.private_authority_deadline_milliseconds !== 4_000) {
    refuse("gateway_manifest_is_not_approved_production_profile");
  }
  if (manifest.solid_ingress_composition_reference !== fingerprint) {
    refuse("gateway_fingerprint_differs_from_candidate");
  }
  const reference = gatewayPrefix + createHash("sha256").update(manifestBytes).digest("hex");
  const sourceVars = sourceConfig?.env?.production?.vars;
  const builtVars = builtConfig?.vars;
  if (builtConfig?.name !== "pirate-web-solid-production") {
    refuse("built_worker_is_not_production");
  }
  for (const vars of [sourceVars, builtVars]) {
    if (vars?.HNS_COMMUNITY_APP_INGRESS_ENABLED !== "true"
      || vars?.HNS_HANDLE_HOST_INGRESS_ENABLED !== "true"
      || vars?.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE !== reference
      || vars?.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE !== reference
      || vars?.HNS_COMMUNITY_APP_INGRESS_ORIGIN !== productionOrigin
      || vars?.HNS_HANDLE_HOST_INGRESS_ORIGIN !== productionOrigin) {
      refuse("worker_bindings_differ_from_active_gateway");
    }
  }
  return { gatewayReference: reference, fingerprint };
}

export async function checkLiveProductionGateway() {
  const manifestBytes = execFileSync("ssh", [
    "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes",
    gatewayHost, "cat", manifestPath,
  ], { timeout: 15_000, maxBuffer: 65_536, stdio: ["ignore", "pipe", "pipe"] });
  const { config, sources, packageJson } = await readIngressCompositionInputs(root);
  const fingerprint = productionIngressCompositionIdentity(config, sources, packageJson);
  const builtConfig = readJson(
    await readFile(new URL("../dist/ssr/wrangler.json", import.meta.url)),
    "built_config",
  );
  return checkProductionGatewayCandidate({
    sourceConfig: config,
    builtConfig,
    manifestBytes,
    fingerprint,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) refuse("unexpected_argument");
  try {
    const result = await checkLiveProductionGateway();
    console.log(JSON.stringify({ event: "hns_production_gateway_preflight_passed", ...result }));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("hns_production_deploy_refused:")
      ? error.message : "hns_production_deploy_refused:gateway_read_or_candidate_check_failed");
    process.exitCode = 1;
  }
}
