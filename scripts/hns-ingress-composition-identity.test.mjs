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

const { config, sources } = await readStagingIngressCompositionInputs();

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
  const original = stagingIngressCompositionIdentity(config, sources);
  const worker = sources.get("src/worker.ts").toString("utf8");
  assert.match(worker, /!community\.enabled &&\s*!handle\.enabled/u);
  const changed = new Map(sources);
  changed.set("src/worker.ts", Buffer.from(worker.replace("!community.enabled &&", "community.enabled &&")));
  assert.notEqual(stagingIngressCompositionIdentity(config, changed), original);
});

test("an ingress module edit changes the fingerprint", () => {
  const original = stagingIngressCompositionIdentity(config, sources);
  const changed = new Map(sources);
  changed.set("src/hns-ingress/worker-router.ts", Buffer.concat([
    sources.get("src/hns-ingress/worker-router.ts"), Buffer.from("\n// changed dispatch\n"),
  ]));
  assert.notEqual(stagingIngressCompositionIdentity(config, changed), original);
});

test("gateway reference and rollout flags cannot create a fingerprint cycle", () => {
  const original = stagingIngressCompositionIdentity(config, sources);
  const changed = changedConfig((copy) => {
    copy.env.staging.vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE =
      `hns-community-app-gateway-sha256:${"a".repeat(64)}`;
    copy.env.staging.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED = "true";
    copy.env.staging.vars.HNS_HANDLE_HOST_INGRESS_ENABLED = "true";
  });
  assert.deepEqual(projectStagingIngressConfiguration(changed), projectStagingIngressConfiguration(config));
  assert.equal(stagingIngressCompositionIdentity(changed, sources), original);
});

test("protected route, Access, registry, secrets and replay binding are bound", () => {
  const original = stagingIngressCompositionIdentity(config, sources);
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
      assert.throws(() => stagingIngressCompositionIdentity(changed, sources), /protected_route_mismatch/u);
    } else {
      assert.notEqual(stagingIngressCompositionIdentity(changed, sources), original);
    }
  }
});

test("a new HNS community variable cannot silently escape the projection", () => {
  const changed = changedConfig((copy) => {
    copy.env.staging.vars.HNS_COMMUNITY_APP_NEW_SECURITY_SETTING = "enabled";
  });
  assert.throws(() => stagingIngressCompositionIdentity(changed, sources), /unbound_variable/u);
});

test("the CLI identity has the bounded gateway-compatible format and is deterministic", async () => {
  const identity = stagingIngressCompositionIdentity(config, sources);
  assert.match(identity, /^solid-hns-ingress-sha256:[a-f0-9]{64}$/u);
  assert.equal(identity, stagingIngressCompositionIdentity(config, sources));
  const workerBytes = await readFile(new URL("../src/worker.ts", import.meta.url));
  assert.deepEqual(workerBytes, sources.get("src/worker.ts"));
});
