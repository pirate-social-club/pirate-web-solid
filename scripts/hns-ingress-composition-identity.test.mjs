import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  productionIngressCompositionIdentity,
  projectProductionIngressConfiguration,
  projectStagingIngressConfiguration,
  readStagingIngressCompositionInputs,
  stagingIngressCompositionIdentity,
} from "./hns-ingress-composition-identity.mjs";

import { ingressRuntimePaths } from "./hns-ingress-runtime-graph.mjs";

const { config, sources, packageJson } = await readStagingIngressCompositionInputs();

function identity(testConfig = config, testSources = sources, testPackage = packageJson) {
  return stagingIngressCompositionIdentity(testConfig, testSources, testPackage);
}

function projection(testConfig = config, testPackage = packageJson) {
  return projectStagingIngressConfiguration(testConfig, testPackage);
}

function changedConfig(change) {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

test("the discovered security closure includes projection and frozen validation", () => {
  const paths = ingressRuntimePaths(sources);
  assert.ok(paths.includes("src/worker.ts"));
  assert.ok(paths.includes("src/features/profiles/persona-public-profile/persona-public-profile.model.ts"));
  assert.ok(paths.includes("src/hns-ingress/public-persona-validator/public-persona-validator.ts"));
  assert.ok(paths.includes("src/hns-ingress/public-persona-validator/public-persona-schema.ts"));
});

test("the Worker disabled-host refusal guard is inside the fingerprint", () => {
  const original = identity();
  const worker = sources.get("src/worker.ts").toString("utf8");
  assert.match(worker, /!community\.enabled &&\s*!handle\.enabled/u);
  const changed = new Map(sources);
  changed.set("src/worker.ts", Buffer.from(worker.replace("!community.enabled &&", "community.enabled &&")));
  assert.notEqual(identity(config, changed), original);
});

test("an ingress module edit changes the fingerprint", () => {
  const original = identity();
  const changed = new Map(sources);
  changed.set("src/hns-ingress/worker-router.ts", Buffer.concat([
    sources.get("src/hns-ingress/worker-router.ts"), Buffer.from("\n// changed dispatch\n"),
  ]));
  assert.notEqual(identity(config, changed), original);
});

test("gateway reference and rollout flags cannot create a fingerprint cycle", () => {
  const original = identity();
  const changed = changedConfig((copy) => {
    copy.env.staging.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE =
      `hns-community-app-handle-gateway-sha256:${"a".repeat(64)}`;
    copy.env.staging.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE =
      copy.env.staging.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE;
    copy.env.staging.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED = "true";
    copy.env.staging.vars.HNS_HANDLE_HOST_INGRESS_ENABLED = "true";
  });
  assert.deepEqual(projection(changed), projection());
  assert.equal(identity(changed), original);
});

test("staging handle-host settings are enabled, bound and fingerprinted", () => {
  const original = identity();
  const baseline = projection().protected_vars;
  assert.equal(config.env.staging.vars.HNS_HANDLE_HOST_INGRESS_ENABLED, "true");
  assert.equal(baseline.HNS_HANDLE_HOST_INGRESS_ORIGIN, baseline.HNS_COMMUNITY_APP_INGRESS_ORIGIN);

  for (const [name, value] of [
    ["HNS_HANDLE_HOST_INGRESS_ENABLED", "false"],
    ["HNS_HANDLE_HOST_INGRESS_ORIGIN", "https://handle-staging.pirate.sc"],
    ["HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE", "new-gateway"],
  ]) {
    const changed = changedConfig((copy) => { copy.env.staging.vars[name] = value; });
    assert.throws(() => identity(changed), /staging_(?:ingress|gateway)/u);
  }

  for (const name of ["HNS_HANDLE_HOST_CANONICAL_ORIGIN", "HNS_HANDLE_HOST_ACCESS_AUDIENCE"]) {
    const changed = changedConfig((copy) => { copy.env.staging.vars[name] = "different"; });
    assert.notEqual(identity(changed), original);
  }

  const added = changedConfig((copy) => {
    copy.env.staging.vars.HNS_HANDLE_HOST_NEW_ROUTING_SETTING = "enabled";
  });
  assert.throws(() => identity(added), /unbound_variable_HNS_HANDLE_HOST_/u);
});

test("an unrelated API-client bump leaves the ingress fingerprint unchanged", () => {
  const changed = structuredClone(packageJson);
  changed.dependencies["@pirate/api-client"] = "file:vendor/api-client/pirate-api-client-9.999.0.tgz";
  assert.deepEqual(projection(config, changed), projection());
  assert.equal(identity(config, sources, changed), identity());
});

test("protected route, Access, registry, secrets and replay binding are bound", () => {
  const original = identity();
  const changes = [
    (copy) => { copy.env.staging.routes[1].custom_domain = false; },
    (copy) => { copy.env.staging.routes[1].zone_name = "pirate.sc"; },
    (copy) => { copy.env.staging.vars.HNS_COMMUNITY_APP_ACCESS_AUDIENCE = "different"; },
    (copy) => { copy.env.staging.vars.HNS_FORWARDER_V3_KEY_REGISTRY_VERSION = "different"; },
    (copy) => { copy.env.staging.secrets.required.push("NEW_PROTECTED_SECRET"); },
    (copy) => { copy.env.staging.durable_objects.bindings[0].class_name = "DifferentReplayStore"; },
  ];
  for (const change of changes) {
    const changed = changedConfig(change);
    if (changed.env.staging.routes[1].custom_domain === false || "zone_name" in changed.env.staging.routes[1]) {
      assert.throws(() => identity(changed), /protected_route_mismatch/u);
    } else {
      assert.notEqual(identity(changed), original);
    }
  }
});

test("a new HNS community variable cannot silently escape the projection", () => {
  const changed = changedConfig((copy) => {
    copy.env.staging.vars.HNS_COMMUNITY_APP_NEW_SECURITY_SETTING = "enabled";
  });
  assert.throws(() => identity(changed), /unbound_variable/u);
});

test("the CLI identity has the bounded gateway-compatible format and is deterministic", async () => {
  const reference = identity();
  assert.match(reference, /^solid-hns-ingress-sha256:[a-f0-9]{64}$/u);
  assert.equal(reference, identity());
  const workerBytes = await readFile(new URL("../src/worker.ts", import.meta.url));
  assert.deepEqual(workerBytes, sources.get("src/worker.ts"));
});

test("production ingress has its own fingerprint with a valid protected route", () => {
  const staging = identity();
  assert.notEqual(staging, "solid-hns-ingress-sha256:50be3dc2071cca64d35ab3c9773d5feb74157dea44d8afae02156154e1765bbc");
  const production = productionIngressCompositionIdentity(config, sources, packageJson);
  assert.match(production, /^solid-hns-ingress-sha256:[a-f0-9]{64}$/u);
  assert.notEqual(production, staging);
  const projection = projectProductionIngressConfiguration(config, packageJson);
  assert.equal(projection.schema, "pirate-solid-hns-production-ingress-composition-v4");
  assert.equal(projection.protected_route.pattern, "hns-community-ingress.pirate.sc");

  const changedReference = changedConfig((copy) => {
    copy.env.production.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE = "next";
    copy.env.production.vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE = "next";
  });
  assert.equal(
    productionIngressCompositionIdentity(changedReference, sources, packageJson),
    production,
  );
  const changedOrigin = changedConfig((copy) => {
    copy.env.production.vars.HNS_HANDLE_HOST_INGRESS_ORIGIN = "https://different.pirate.sc";
  });
  assert.throws(
    () => productionIngressCompositionIdentity(changedOrigin, sources, packageJson),
    /production_ingress_origin_mismatch/u,
  );
});


test("every previously omitted projection and frozen validation input changes identity", () => {
  for (const path of [
    "src/features/profiles/persona-public-profile/persona-public-profile.model.ts",
    "src/hns-ingress/public-persona-validator/public-persona-validator.ts",
    "src/hns-ingress/public-persona-validator/public-persona-schema.ts",
  ]) {
    const changed = new Map(sources);
    changed.set(path, Buffer.concat([sources.get(path), Buffer.from("\n// reviewed security change\n")]));
    assert.notEqual(identity(config, changed), identity());
  }
});

test("new Worker adapter runtime edges require classification", () => {
  const changed = new Map(sources);
  changed.set("src/worker.ts", Buffer.concat([sources.get("src/worker.ts"), Buffer.from('\nimport "./new-helper.ts";\n')]));
  assert.throws(() => identity(config, changed), /unclassified_adapter_edge/u);
});

test("transitive value imports, reexports, dynamic client imports and computed loads refuse", () => {
  const path = "src/features/profiles/persona-public-profile/persona-public-profile.model.ts";
  for (const statement of [
    'import "@pirate/api-client";',
    'export { createPirateApiClient } from "@pirate/api-client";',
    'void import("@pirate/api-client");',
    'void import(variable);',
    'require("@pirate/api-client");',
    'import "./missing-security-helper.ts";',
  ]) {
    const changed = new Map(sources);
    changed.set(path, Buffer.concat([sources.get(path), Buffer.from("\n" + statement)]));
    assert.throws(() => identity(config, changed), /identity_refused/u);
  }
});

test("new local ingress helpers are discovered and deterministically bound", () => {
  const changed = new Map(sources);
  changed.set("src/hns-ingress/worker-router.ts", Buffer.concat([sources.get("src/hns-ingress/worker-router.ts"), Buffer.from('\nimport "./new-security-helper.ts";\n')]));
  changed.set("src/hns-ingress/new-security-helper.ts", Buffer.from("export const safety = true;\n"));
  assert.ok(ingressRuntimePaths(changed).includes("src/hns-ingress/new-security-helper.ts"));
  assert.notEqual(identity(config, changed), identity());
  assert.equal(identity(config, changed), identity(config, new Map([...changed].reverse())));
});


test("type-only client dependencies remain outside the runtime graph", () => {
  const path = "src/features/profiles/persona-public-profile/persona-public-profile.model.ts";
  const changed = new Map(sources);
  changed.set(path, Buffer.concat([sources.get(path), Buffer.from('\nexport type { PirateApiClient } from "@pirate/api-client";\n')]));
  assert.ok(ingressRuntimePaths(changed).includes(path));
});

test("runtime cycles terminate and literal dynamic local dependencies are included", () => {
  const changed = new Map(sources);
  changed.set("src/hns-ingress/worker-router.ts", Buffer.concat([sources.get("src/hns-ingress/worker-router.ts"), Buffer.from('\nvoid import("./cycle-helper.ts");\n')]));
  changed.set("src/hns-ingress/cycle-helper.ts", Buffer.from('import "./worker-router.ts";\n'));
  assert.ok(ingressRuntimePaths(changed).includes("src/hns-ingress/cycle-helper.ts"));
});
