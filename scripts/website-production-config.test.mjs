import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkWebsiteProductionConfig, websiteBuildMode, websiteProductionOverrides } from "./website-production-config.mjs";

const source = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
function fixture() {
  const effective = { ...source, ...source.env.production };
  const built = structuredClone(effective);
  delete built.env;
  built.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED = "false";
  built.vars.HNS_HANDLE_HOST_INGRESS_ENABLED = "false";
  return { ...built, main: "index.js", assets: { directory: "../client", binding: "ASSETS" },
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], no_bundle: true,
    targetEnvironment: "production", queues: { producers: [], consumers: [] }, triggers: { crons: [] } };
}
test("website projection changes only two activation flags and preserves source", () => {
  const effective = structuredClone({ ...source, ...source.env.production });
  const before = structuredClone(effective);
  const output = websiteProductionOverrides(effective, "production");
  const expected = structuredClone(effective.vars);
  expected.HNS_COMMUNITY_APP_INGRESS_ENABLED = "false";
  expected.HNS_HANDLE_HOST_INGRESS_ENABLED = "false";
  assert.deepEqual(output, { vars: expected }); assert.deepEqual(effective, before);
  assert.equal(checkWebsiteProductionConfig(source, fixture()).hns_enabled, false);
});
test("strict release mode rejects fixture API and nonproduction selection", () => {
  assert.equal(websiteBuildMode({}), false);
  assert.equal(websiteBuildMode({ PIRATE_WEBSITE_ONLY_RELEASE: "1", CLOUDFLARE_ENV: "production" }), true);
  for (const env of [
    { PIRATE_WEBSITE_ONLY_RELEASE: "true", CLOUDFLARE_ENV: "production" },
    { PIRATE_WEBSITE_ONLY_RELEASE: "1", CLOUDFLARE_ENV: "staging" },
    { PIRATE_WEBSITE_ONLY_RELEASE: "1", CLOUDFLARE_ENV: "production", SOLID_API_NEXT_FIXTURE_ORIGIN: "" },
  ]) assert.throws(() => websiteBuildMode(env), /website_production_refused/);
});
const mutations = {
  enabled: b => { b.vars.HNS_COMMUNITY_APP_INGRESS_ENABLED = "true"; },
  missing: b => { delete b.vars.HNS_HANDLE_HOST_INGRESS_ENABLED; },
  origin: b => { b.vars.HNS_COMMUNITY_APP_INGRESS_ORIGIN = ""; },
  api: b => { b.vars.API_NEXT_ORIGIN = "https://fixture.invalid"; },
  account: b => { b.account_id = "wrong"; },
  worker: b => { b.name = "pirate-web-solid-staging"; },
  routes: b => { b.routes.pop(); },
  entry: b => { b.main = "../../outside.js"; },
  assets: b => { b.assets.directory = "../../outside"; },
  services: b => { b.services = [{ binding: "EXTRA", service: "other" }]; },
  storage: b => { b.r2_buckets = [{ binding: "EXTRA", bucket_name: "other" }]; },
  queue: b => { b.queues.consumers.push({ queue: "other" }); },
  cron: b => { b.triggers.crons.push("* * * * *"); },
  secret: b => { b.secrets.required.push("EXTRA"); },
  replay: b => { b.durable_objects.bindings[0].class_name = "Other"; },
  compatibility: b => { b.compatibility_date = "2020-01-01"; },
};
for (const [name, mutate] of Object.entries(mutations)) test("rejects generated config drift: " + name, () => {
  const built = fixture(); mutate(built);
  assert.throws(() => checkWebsiteProductionConfig(source, built), /website_production_refused/);
});
