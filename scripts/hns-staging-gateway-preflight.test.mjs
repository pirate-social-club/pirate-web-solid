import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { checkStagingGatewayCandidate } from "./hns-staging-gateway-preflight.mjs";

function fixture() {
  const fingerprint = `solid-hns-ingress-sha256:${"a".repeat(64)}`;
  const origin = "https://hns-community-ingress-staging.pirate.sc";
  const manifestBytes = Buffer.from(JSON.stringify({
    schema: "pirate-hns-community-app-handle-gateway-staging-public-v1",
    mode: "staging-public-tls", solid_origin: origin,
    solid_ingress_composition_reference: fingerprint,
  }));
  const reference = `hns-community-app-handle-gateway-sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`;
  const vars = {
    HNS_COMMUNITY_APP_INGRESS_ENABLED: "true",
    HNS_HANDLE_HOST_INGRESS_ENABLED: "true",
    HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE: reference,
    HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE: reference,
    HNS_COMMUNITY_APP_INGRESS_ORIGIN: origin,
    HNS_HANDLE_HOST_INGRESS_ORIGIN: origin,
  };
  return { sourceConfig: { env: { staging: { vars: { ...vars } } } },
    builtConfig: { name: "pirate-web-solid-staging", vars: { ...vars } },
    manifestBytes, fingerprint, reference };
}

test("accepts only the built staging Worker pinned to its active gateway", () => {
  const value = fixture();
  assert.deepEqual(checkStagingGatewayCandidate(value), {
    gatewayReference: value.reference, fingerprint: value.fingerprint,
  });
});

test("refuses an older ingress composition even when the gateway reference matches", () => {
  const value = fixture();
  value.fingerprint = `solid-hns-ingress-sha256:${"b".repeat(64)}`;
  assert.throws(() => checkStagingGatewayCandidate(value), /gateway_fingerprint_differs_from_candidate/u);
});

test("refuses stale source and built gateway bindings", () => {
  const value = fixture();
  value.sourceConfig.env.staging.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE = "old";
  assert.throws(() => checkStagingGatewayCandidate(value), /worker_bindings_differ_from_active_gateway/u);
  value.sourceConfig.env.staging.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE = value.reference;
  value.builtConfig.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE = "old";
  assert.throws(() => checkStagingGatewayCandidate(value), /worker_bindings_differ_from_active_gateway/u);
});
