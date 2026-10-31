import assert from "node:assert/strict";
import test from "node:test";
import { assertStagingConfiguration, frozenBuildEnvironment, requireReadOnlyMount, stagingSelection } from "./staging-build-isolation.mjs";

const root = "/tmp/pirate-v1-solid-staging-" + "a".repeat(32);
test("staging modes retain exact normal commands and require a fresh-root-shaped frozen argument", () => {
  for (const mode of ["--deploy", "--check-only", "--check-release"]) assert.deepEqual(stagingSelection([mode]), { mode, frozen: false });
  for (const mode of ["--prepare-frozen", "--deploy-frozen", "--check-frozen-release"])
    assert.deepEqual(stagingSelection([mode, root]), { mode, frozen: true, runRoot: root });
  for (const args of [[], ["--deploy", root], ["--deploy-frozen"], ["--deploy-frozen", root, "extra"],
    ["--deploy-frozen", "/tmp/../root"], ["--deploy-frozen", "/tmp/pirate-v1-solid-staging-" + "A".repeat(32)],
    ["--source-ref", "other"], ["--deploy-frozen", "relative"]]) assert.throws(() => stagingSelection(args));
});

test("longest native mount controls dependency write protection", () => {
  const rw = "1 0 0:1 / / rw - ext4 disk rw\n";
  const ro = rw + "2 1 0:1 /source /frozen ro,relatime - ext4 disk rw\n";
  assert.throws(() => requireReadOnlyMount("/frozen/node_modules", rw));
  requireReadOnlyMount("/frozen/node_modules", ro);
  assert.throws(() => requireReadOnlyMount("/frozen-other/node_modules", ro));
  assert.throws(() => requireReadOnlyMount("/frozen/node_modules", ro + "3 2 0:2 / /frozen/node_modules rw - tmpfs tmp rw\n"));
  requireReadOnlyMount("/frozen space/node_modules", rw + "4 1 0:1 / /frozen\\040space ro - ext4 disk rw\n");
});

test("frozen staging build cannot inherit production mode, fixture API, operator secrets or config injection", () => {
  const environment = frozenBuildEnvironment({ HOME: "/fixture/home", PATH: "/ambient", PIRATE_WEBSITE_ONLY_RELEASE: "1",
    CLOUDFLARE_ENV: "production", CLOUDFLARE_API_TOKEN: "dummy-provider", NODE_OPTIONS: "--require=forbidden",
    CONTROL_PLANE_POSTGRES_ADMIN_URL: "dummy-owner", VITE_SECRET: "dummy-build" }, root);
  assert.equal(environment.CLOUDFLARE_ENV, "staging"); assert.equal(environment.HOME, "/fixture/home");
  assert.equal(environment.TMPDIR, root + "/tmp"); assert.equal(environment.XDG_CACHE_HOME, root + "/cache");
  for (const key of ["PIRATE_WEBSITE_ONLY_RELEASE", "CLOUDFLARE_API_TOKEN", "NODE_OPTIONS", "CONTROL_PLANE_POSTGRES_ADMIN_URL", "VITE_SECRET"])
    assert.equal(environment[key], undefined);
  assert.throws(() => frozenBuildEnvironment({ SOLID_API_NEXT_FIXTURE_ORIGIN: "http://127.0.0.1:8788" }, root));
});

test("frozen flattened configuration retains exact staging vars and refuses production/fixture/HNS drift", () => {
  const vars = { API_NEXT_ORIGIN: "https://api-next-staging.pirate.sc", PUBLIC_APP_CANONICAL_ORIGIN: "https://web-next-staging.pirate.sc",
    HNS_COMMUNITY_APP_INGRESS_ENABLED: "true", HNS_HANDLE_HOST_INGRESS_ENABLED: "true", retained_setting: "unchanged" };
  const source = { account_id: "fixture-account", env: { staging: { vars } } };
  const valid = { name: "pirate-web-solid-staging", account_id: "fixture-account", targetEnvironment: "staging", vars: { ...vars } };
  assertStagingConfiguration(source, valid);
  for (const change of [{ name: "pirate-web-solid-production" }, { account_id: "other" }, { targetEnvironment: "production" },
    { vars: { ...vars, API_NEXT_ORIGIN: "http://127.0.0.1:8788" } }, { vars: { ...vars, HNS_HANDLE_HOST_INGRESS_ENABLED: "false" } },
    { vars: { ...vars, retained_setting: "changed" } }, { vars: { ...vars, unexpected: "input" } }])
    assert.throws(() => assertStagingConfiguration(source, { ...valid, ...change }));
});
