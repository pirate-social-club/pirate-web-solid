import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  productionIngressCompositionIdentity,
  readIngressCompositionInputs,
} from "./hns-ingress-composition-identity.mjs";
import { checkProductionGatewayCandidate } from "./hns-production-gateway-preflight.mjs";

const { config, sources, packageJson } = await readIngressCompositionInputs();
const fingerprint = productionIngressCompositionIdentity(config, sources, packageJson);

function candidate() {
  const manifest = {
    schema: "pirate-hns-community-app-handle-gateway-deployment-v1",
    solid_origin: "https://hns-community-ingress.pirate.sc",
    solid_ingress_composition_reference: fingerprint,
    private_authority_deadline_milliseconds: 4_000,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const reference = "hns-community-app-handle-gateway-sha256:"
    + createHash("sha256").update(manifestBytes).digest("hex");
  const sourceConfig = structuredClone(config);
  sourceConfig.env.production.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE = reference;
  sourceConfig.env.production.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE = reference;
  const builtConfig = {
    name: "pirate-web-solid-production",
    vars: structuredClone(sourceConfig.env.production.vars),
  };
  return { sourceConfig, builtConfig, manifestBytes, manifest, reference };
}

test("production deploy accepts only the exact active gateway and ingress fingerprint", () => {
  const value = candidate();
  assert.deepEqual(checkProductionGatewayCandidate({ ...value, fingerprint }), {
    gatewayReference: value.reference,
    fingerprint,
  });
});

test("production deploy refuses stale Worker bindings before mutation", () => {
  const value = candidate();
  value.builtConfig.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE = "stale";
  assert.throws(
    () => checkProductionGatewayCandidate({ ...value, fingerprint }),
    /worker_bindings_differ_from_active_gateway/u,
  );
});

test("production deploy refuses an old fingerprint or authority budget", () => {
  const oldFingerprint = candidate();
  oldFingerprint.manifest.solid_ingress_composition_reference = "old";
  oldFingerprint.manifestBytes = Buffer.from(JSON.stringify(oldFingerprint.manifest));
  assert.throws(
    () => checkProductionGatewayCandidate({ ...oldFingerprint, fingerprint }),
    /gateway_fingerprint_differs_from_candidate/u,
  );

  const oldBudget = candidate();
  oldBudget.manifest.private_authority_deadline_milliseconds = 2_000;
  oldBudget.manifestBytes = Buffer.from(JSON.stringify(oldBudget.manifest));
  assert.throws(
    () => checkProductionGatewayCandidate({ ...oldBudget, fingerprint }),
    /gateway_manifest_is_not_approved_production_profile/u,
  );
});
