import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertIngressSourcePaths,
  INGRESS_SOURCE_PATHS,
  projectStagingIngressConfiguration,
  readStagingIngressCompositionInputs,
  stagingIngressCompositionIdentity,
} from "./hns-ingress-composition-identity.mjs";

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

test("the reviewed source set includes Worker host dispatch and refuses additions", () => {
  assert.equal(INGRESS_SOURCE_PATHS.length, 20);
  assert.ok(INGRESS_SOURCE_PATHS.includes("src/worker.ts"));
  assertIngressSourcePaths(INGRESS_SOURCE_PATHS);
  assert.throws(
    () => assertIngressSourcePaths([...INGRESS_SOURCE_PATHS, "src/hns-ingress/new-dispatch.ts"]),
    /source_file_set_changed/u,
  );
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
      `hns-community-app-gateway-sha256:${"a".repeat(64)}`;
    copy.env.staging.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED = "true";
  });
  assert.deepEqual(projection(changed), projection());
  assert.equal(identity(changed), original);
});

test("staging handle-host settings remain explicitly disabled and fingerprinted", () => {
  const original = identity();
  const baseline = projection().disabled_handle_host_vars;
  assert.equal(baseline.HNS_HANDLE_HOST_INGRESS_ENABLED, "false");
  assert.equal(baseline.HNS_HANDLE_HOST_INGRESS_ORIGIN, "");

  for (const [name, value] of [
    ["HNS_HANDLE_HOST_INGRESS_ENABLED", "true"],
    ["HNS_HANDLE_HOST_INGRESS_ORIGIN", "https://handle-staging.pirate.sc"],
    ["HNS_HANDLE_HOST_ACCESS_AUDIENCE", "new-audience"],
    ["HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE", "new-gateway"],
  ]) {
    const changed = changedConfig((copy) => { copy.env.staging.vars[name] = value; });
    assert.throws(() => identity(changed), /handle_host_must_remain_/u);
  }

  const changedCanonical = changedConfig((copy) => {
    copy.env.staging.vars.HNS_HANDLE_HOST_CANONICAL_ORIGIN = "https://other.example";
  });
  assert.notEqual(identity(changedCanonical), original);

  const added = changedConfig((copy) => {
    copy.env.staging.vars.HNS_HANDLE_HOST_NEW_ROUTING_SETTING = "enabled";
  });
  assert.throws(() => identity(added), /unbound_variable_HNS_HANDLE_HOST_/u);
});

test("the pinned vendored API client dependency is part of the fingerprint", () => {
  const original = identity();
  assert.equal(projection().api_client_dependency, packageJson.dependencies["@pirate/api-client"]);
  const changed = structuredClone(packageJson);
  changed.dependencies["@pirate/api-client"] = "file:vendor/api-client/pirate-api-client-0.88.1.tgz";
  assert.notEqual(identity(config, sources, changed), original);
  changed.dependencies["@pirate/api-client"] = "*";
  assert.throws(() => identity(config, sources, changed), /unpinned_api_client_dependency/u);
  changed.dependencies["@pirate/api-client"] = "file:vendor/api-client/pirate-api-client-0.93.0-latest.tgz";
  assert.throws(() => identity(config, sources, changed), /unpinned_api_client_dependency/u);
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
