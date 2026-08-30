import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const workerSource = await readFile(new URL("../src/worker.ts", import.meta.url), "utf8");
const replaySource = await readFile(new URL("../src/hns-ingress/replay-store-sql.ts", import.meta.url), "utf8");
const production = config.env?.production;
const staging = config.env?.staging;
const communityRequiredSecrets = [
  "HNS_FORWARDER_V3_HMAC_KEY_REGISTRY",
  "HNS_COMMUNITY_APP_API_ACCESS_CLIENT_ID",
  "HNS_COMMUNITY_APP_API_ACCESS_CLIENT_SECRET",
  "HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_ID",
  "HNS_COMMUNITY_APP_AUTHORITY_ACCESS_CLIENT_SECRET",
];
const handleRequiredSecrets = [
  "HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_ID",
  "HNS_HANDLE_HOST_AUTHORITY_ACCESS_CLIENT_SECRET",
];
const allRequiredSecrets = [...communityRequiredSecrets, ...handleRequiredSecrets];
const replayBinding = [
  {
    name: "HNS_COMMUNITY_APP_REPLAY",
    class_name: "HnsCommunityAppReplayStoreDO",
  },
];
const hnsVars = [
  "HNS_COMMUNITY_APP_INGRESS_ENABLED",
  "HNS_COMMUNITY_APP_INGRESS_ORIGIN",
  "HNS_COMMUNITY_APP_CANONICAL_ORIGIN",
  "HNS_COMMUNITY_APP_API_ORIGIN",
  "HNS_COMMUNITY_APP_ACCESS_ISSUER",
  "HNS_COMMUNITY_APP_ACCESS_JWKS_URL",
  "HNS_COMMUNITY_APP_ACCESS_AUDIENCE",
  "HNS_COMMUNITY_APP_AUTHORITY_ORIGIN",
  "HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE",
  "HNS_HANDLE_HOST_INGRESS_ENABLED",
  "HNS_HANDLE_HOST_INGRESS_ORIGIN",
  "HNS_HANDLE_HOST_CANONICAL_ORIGIN",
  "HNS_HANDLE_HOST_PUBLIC_API_ORIGIN",
  "HNS_HANDLE_HOST_ACCESS_ISSUER",
  "HNS_HANDLE_HOST_ACCESS_JWKS_URL",
  "HNS_HANDLE_HOST_ACCESS_AUDIENCE",
  "HNS_HANDLE_HOST_AUTHORITY_ORIGIN",
  "HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE",
  "HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE",
  "HNS_FORWARDER_V3_KEY_REGISTRY_VERSION",
  "HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS",
  "HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS",
];

assert.equal(config.account_id, "08a4c22cf52e2ecae883e36f80a33f4a");
assert.equal(config.main, "./src/worker.ts");
assert.deepEqual(config.migrations, [
  { tag: "v1", new_sqlite_classes: ["HnsCommunityAppReplayStoreDO"] },
]);

for (const environment of [config, staging]) {
  assert.equal(environment.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED, "false");
  assert.equal(environment.vars.HNS_HANDLE_HOST_INGRESS_ENABLED, "false");
  for (const name of hnsVars) assert.equal(typeof environment.vars[name], "string", `${name} must be explicit`);
  assert.deepEqual(environment.durable_objects?.bindings, replayBinding);
}
assert.equal(production.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED, "true");
assert.equal(production.vars.HNS_HANDLE_HOST_INGRESS_ENABLED, "true");
for (const name of hnsVars) assert.equal(typeof production.vars[name], "string", `${name} must be explicit`);
assert.deepEqual(production.durable_objects?.bindings, replayBinding);

assert.deepEqual(config.secrets?.required, allRequiredSecrets);
assert.deepEqual(staging.secrets?.required, allRequiredSecrets);
assert.deepEqual(production.secrets?.required, communityRequiredSecrets);

assert.deepEqual(production.routes, [
  { pattern: "pirate.sc", custom_domain: true },
  { pattern: "hns-community-ingress.pirate.sc", custom_domain: true },
]);
assert.equal(production.name, "pirate-web-solid-production");
assert.equal(production.workers_dev, true);
assert.equal(production.preview_urls, false);
assert.equal(production.vars.API_NEXT_ORIGIN, "https://api-next.pirate.sc");
assert.equal(production.vars.HNS_COMMUNITY_APP_INGRESS_ORIGIN, "https://hns-community-ingress.pirate.sc");
assert.equal(production.vars.HNS_COMMUNITY_APP_CANONICAL_ORIGIN, "https://pirate.sc");
assert.equal(production.vars.HNS_COMMUNITY_APP_API_ORIGIN, "https://hns-community-api.pirate.sc");
assert.equal(production.vars.HNS_COMMUNITY_APP_ACCESS_ISSUER, "https://piratesocialclub.cloudflareaccess.com");
assert.equal(
  production.vars.HNS_COMMUNITY_APP_ACCESS_JWKS_URL,
  "https://piratesocialclub.cloudflareaccess.com/cdn-cgi/access/certs",
);
assert.equal(
  production.vars.HNS_COMMUNITY_APP_ACCESS_AUDIENCE,
  "76194ec307b738b9939f3e5bd8cb2472bacbdb2565afa4e8aca7d46241db7ae8",
);
assert.equal(production.vars.HNS_COMMUNITY_APP_AUTHORITY_ORIGIN, "https://hns-community-api.pirate.sc");
assert.equal(
  production.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE,
  "hns-community-app-gateway-sha256:c71dad926193c155b38e8a2363f722d7d729cf1813882b7ff4a96ba3d09a9e23",
);
assert.equal(
  production.vars.HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE,
  "pirate:hns-forwarder-v3:production-community-app:v1",
);
assert.equal(production.vars.HNS_FORWARDER_V3_KEY_REGISTRY_VERSION, "2026-08-28-02");
assert.equal(production.vars.HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS, "300");
assert.equal(production.vars.HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS, "5");
assert.equal(production.vars.HNS_HANDLE_HOST_CANONICAL_ORIGIN, "https://pirate.sc");
assert.equal(production.vars.HNS_HANDLE_HOST_PUBLIC_API_ORIGIN, "https://api-next.pirate.sc");
assert.equal(production.vars.HNS_HANDLE_HOST_INGRESS_ORIGIN, "https://hns-community-ingress.pirate.sc");
assert.equal(production.vars.HNS_HANDLE_HOST_ACCESS_ISSUER, "https://piratesocialclub.cloudflareaccess.com");
assert.equal(
  production.vars.HNS_HANDLE_HOST_ACCESS_JWKS_URL,
  "https://piratesocialclub.cloudflareaccess.com/cdn-cgi/access/certs",
);
assert.equal(
  production.vars.HNS_HANDLE_HOST_ACCESS_AUDIENCE,
  "76194ec307b738b9939f3e5bd8cb2472bacbdb2565afa4e8aca7d46241db7ae8",
);
assert.equal(production.vars.HNS_HANDLE_HOST_AUTHORITY_ORIGIN, "https://hns-community-api.pirate.sc");
assert.equal(
  production.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE,
  "hns-community-app-handle-gateway-sha256:75c3b2183d9ea99c4f07ac811d98b72e7206018950425e01c1644820834a2754",
);
assert.equal(production.vars.PRIVY_APP_ID, "cmnbdx9xk00ty0clapn2q8pdj");

assert.deepEqual(staging.routes, [{ pattern: "web-next-staging.pirate.sc", custom_domain: true }]);
assert.equal(staging.vars.API_NEXT_ORIGIN, "https://api-next-staging.pirate.sc");
assert.equal(staging.vars.HNS_COMMUNITY_APP_CANONICAL_ORIGIN, "https://web-next-staging.pirate.sc");
assert.equal(staging.vars.HNS_HANDLE_HOST_CANONICAL_ORIGIN, "https://pirate.sc");
assert.equal(staging.vars.HNS_HANDLE_HOST_PUBLIC_API_ORIGIN, "https://api-next-staging.pirate.sc");
assert.equal(staging.vars.PRIVY_APP_ID, "cmsw5pis300b80cladbxx7bsr");
assert.notEqual(production.vars.API_NEXT_ORIGIN, staging.vars.API_NEXT_ORIGIN);
assert.notEqual(production.vars.PRIVY_APP_ID, staging.vars.PRIVY_APP_ID);

assert.match(workerSource, /makeProductionHnsCommunityAppIngressCompositionV2/u);
assert.match(workerSource, /makeProductionHnsHandlePersonaIngressCompositionV1/u);
assert.match(workerSource, /routeHnsIngressRequest/u);
assert.match(workerSource, /DISABLE_HYDRATION:\s*true/u);
assert.match(workerSource, /HnsCommunityAppReplayStoreDO/u);
assert.match(replaySource, /nonce TEXT PRIMARY KEY/u);
assert.match(replaySource, /INSERT OR IGNORE/u);
assert.equal(JSON.stringify(config).includes("key_base64url"), false);
assert.equal(JSON.stringify(config).includes("cf-access-client-secret-"), false);
console.log("production-config: production community and handle ingress enabled");
