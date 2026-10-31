import assert from "node:assert/strict";

const account = "08a4c22cf52e2ecae883e36f80a33f4a";
const worker = "pirate-web-solid-production";
const ingress = "https://hns-community-ingress.pirate.sc";
const flags = ["HNS_COMMUNITY_APP_INGRESS_ENABLED", "HNS_HANDLE_HOST_INGRESS_ENABLED"];
const origins = ["HNS_COMMUNITY_APP_INGRESS_ORIGIN", "HNS_HANDLE_HOST_INGRESS_ORIGIN"];

function refuse(reason) {
  throw new Error("website_production_refused:" + reason);
}

function equal(actual, expected, reason) {
  try { assert.deepEqual(actual, expected); } catch { refuse(reason); }
}

/** The ordinary website changes only the two HNS activation flags. */
export function websiteProductionOverrides(config, environment) {
  if (environment !== "production" || config?.name !== worker || config?.account_id !== account) {
    refuse("not_production");
  }
  const vars = config.vars;
  if (vars?.API_NEXT_ORIGIN !== "https://api-next.pirate.sc"
    || vars?.PUBLIC_APP_CANONICAL_ORIGIN !== "https://pirate.sc") refuse("ordinary_origins");
  for (const key of origins) if (vars[key] !== ingress) refuse("reserved_ingress_origin");
  for (const key of flags) if (vars[key] !== "true") refuse("unexpected_source_activation");
  return { vars: { ...vars, ...Object.fromEntries(flags.map(key => [key, "false"])) } };
}

/** Reject fixture retargeting before Vite reads or emits any release config. */
export function websiteBuildMode(environment) {
  const mode = environment.PIRATE_WEBSITE_ONLY_RELEASE;
  if (mode === undefined) return false;
  if (mode !== "1" || environment.CLOUDFLARE_ENV !== "production") refuse("invalid_build_mode");
  if (environment.SOLID_API_NEXT_FIXTURE_ORIGIN !== undefined) refuse("fixture_api_override");
  return true;
}

/** Validate the real flattened build, not just source intentions. */
export function checkWebsiteProductionConfig(source, built) {
  const production = source?.env?.production;
  if (!production) refuse("missing_production_environment");
  const effective = { ...source, ...production };
  const expected = websiteProductionOverrides(effective, "production");
  equal(built?.vars, expected.vars, "built_vars_differ");
  for (const key of ["name", "account_id", "compatibility_date", "compatibility_flags", "routes",
    "durable_objects", "migrations", "secrets", "workers_dev", "preview_urls", "version_metadata"]) {
    equal(built?.[key], effective[key], "built_" + key + "_differs");
  }
  for (const key of ["services", "hyperdrive", "kv_namespaces", "r2_buckets", "d1_databases",
    "vectorize", "analytics_engine_datasets", "mtls_certificates", "dispatch_namespaces",
    "pipelines", "secrets_store_secrets", "worker_loaders", "ratelimits", "vpc_services",
    "vpc_networks", "workflows", "send_email", "ai_search_namespaces", "ai_search",
    "agent_memory", "artifacts", "unsafe_hello_world", "flagship"]) {
    equal(built?.[key] ?? [], effective[key] ?? [], "built_" + key + "_differs");
  }
  equal(built.main, "index.js", "built_entry");
  equal(built.assets, { directory: "../client", binding: "ASSETS" }, "built_assets");
  equal(built.rules, [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], "built_rules");
  equal(built.no_bundle, true, "built_no_bundle");
  equal(built.targetEnvironment, "production", "built_environment");
  equal(built.queues, { producers: [], consumers: [] }, "built_queues");
  equal(built.triggers, Object.hasOwn(built.triggers ?? {}, "crons") ? { crons: [] } : {}, "built_triggers");
  equal(built.cloudchamber, {}, "built_cloudchamber");
  equal(built.logfwdr, { bindings: [] }, "built_logfwdr");
  for (const key of ["ai", "browser", "images", "unsafe", "observability"]) {
    equal(built[key], undefined, "unexpected_" + key);
  }
  equal(built.routes, [
    { pattern: "pirate.sc", custom_domain: true },
    { pattern: "hns-community-ingress.pirate.sc", custom_domain: true },
  ], "production_routes");
  return { kind: "pirate-website-only-production-config-v1", worker, account, hns_enabled: false };
}
