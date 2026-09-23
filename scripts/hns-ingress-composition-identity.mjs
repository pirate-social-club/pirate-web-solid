import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// This is a reviewed source boundary, not a discovery glob. The discovery check
// below refuses a newly added ingress module until this list is updated.
export const INGRESS_SOURCE_PATHS = Object.freeze([
  "src/hns-ingress/access-jwt.ts",
  "src/hns-ingress/authority-client.ts",
  "src/hns-ingress/composition.ts",
  "src/hns-ingress/forwarder-key-registry.ts",
  "src/hns-ingress/handle-authority-client.ts",
  "src/hns-ingress/handle-composition.ts",
  "src/hns-ingress/handle-production-composition.ts",
  "src/hns-ingress/handle-public-persona-client.ts",
  "src/hns-ingress/handle-wire.ts",
  "src/hns-ingress/index.ts",
  "src/hns-ingress/interrupt-deadline.ts",
  "src/hns-ingress/production-composition.ts",
  "src/hns-ingress/replay-store-do.ts",
  "src/hns-ingress/replay-store-sql.ts",
  "src/hns-ingress/replay-store.ts",
  "src/hns-ingress/request-diagnostics.ts",
  "src/hns-ingress/transport.ts",
  "src/hns-ingress/wire.ts",
  "src/hns-ingress/worker-router.ts",
  "src/worker.ts",
]);

const protectedVariableNames = Object.freeze([
  "API_NEXT_ORIGIN",
  "PUBLIC_APP_CANONICAL_ORIGIN",
  "HNS_COMMUNITY_APP_INGRESS_ORIGIN",
  "HNS_COMMUNITY_APP_CANONICAL_ORIGIN",
  "HNS_COMMUNITY_APP_API_ORIGIN",
  "HNS_COMMUNITY_APP_ACCESS_ISSUER",
  "HNS_COMMUNITY_APP_ACCESS_JWKS_URL",
  "HNS_COMMUNITY_APP_ACCESS_AUDIENCE",
  "HNS_COMMUNITY_APP_AUTHORITY_ORIGIN",
  "HNS_HANDLE_HOST_INGRESS_ORIGIN",
  "HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE",
  "HNS_FORWARDER_V3_KEY_REGISTRY_VERSION",
  "HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS",
  "HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS",
]);

// These values intentionally change after the manifest identity is chosen.
const excludedVariableNames = new Set([
  "HNS_COMMUNITY_APP_INGRESS_ENABLED",
  "HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE",
]);

function refuse(message) {
  throw new Error(`hns_ingress_identity_refused:${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stringValue(value, name) {
  if (typeof value !== "string") refuse(`missing_${name}`);
  return value;
}

function uniqueSortedStrings(values, name) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value === "")) {
    refuse(`invalid_${name}`);
  }
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) refuse(`duplicate_${name}`);
  return sorted;
}

export function projectStagingIngressConfiguration(config) {
  const staging = config?.env?.staging;
  const vars = staging?.vars;
  if (typeof vars !== "object" || vars === null) refuse("missing_staging_vars");

  const protectedVars = {};
  for (const name of protectedVariableNames) protectedVars[name] = stringValue(vars[name], name);
  for (const name of Object.keys(vars)) {
    if (
      (name.startsWith("HNS_COMMUNITY_APP_") || name.startsWith("HNS_FORWARDER_V3_")) &&
      !protectedVariableNames.includes(name) &&
      !excludedVariableNames.has(name)
    ) {
      refuse(`unbound_variable_${name}`);
    }
  }

  let protectedHost;
  try {
    const origin = new URL(protectedVars.HNS_COMMUNITY_APP_INGRESS_ORIGIN);
    if (origin.protocol !== "https:" || origin.origin !== protectedVars.HNS_COMMUNITY_APP_INGRESS_ORIGIN) {
      refuse("invalid_protected_origin");
    }
    protectedHost = origin.hostname;
  } catch {
    refuse("invalid_protected_origin");
  }
  const routes = staging.routes;
  if (!Array.isArray(routes)) refuse("missing_staging_routes");
  const matchingRoutes = routes.filter((route) => route?.pattern === protectedHost);
  if (
    matchingRoutes.length !== 1 ||
    matchingRoutes[0].custom_domain !== true ||
    JSON.stringify(Object.keys(matchingRoutes[0]).sort()) !== JSON.stringify(["custom_domain", "pattern"])
  ) {
    refuse("protected_route_mismatch");
  }

  const replayBindings = staging?.durable_objects?.bindings;
  if (!Array.isArray(replayBindings)) refuse("missing_replay_bindings");
  if (
    replayBindings.filter((binding) => binding?.name === "HNS_COMMUNITY_APP_REPLAY").length !== 1
  ) {
    refuse("replay_binding_mismatch");
  }
  if (!Array.isArray(config.migrations)) refuse("missing_replay_migrations");

  return {
    schema: "pirate-solid-hns-staging-ingress-composition-v1",
    main: stringValue(config.main, "worker_entry"),
    compatibility_date: stringValue(config.compatibility_date, "compatibility_date"),
    compatibility_flags: uniqueSortedStrings(config.compatibility_flags, "compatibility_flags"),
    protected_route: matchingRoutes[0],
    protected_vars: protectedVars,
    required_secret_names: uniqueSortedStrings(staging?.secrets?.required, "required_secrets"),
    replay_bindings: [...replayBindings].sort((left, right) => left.name.localeCompare(right.name)),
    migrations: config.migrations,
  };
}

export function assertIngressSourcePaths(discoveredPaths) {
  const expected = [...INGRESS_SOURCE_PATHS].sort();
  const actual = uniqueSortedStrings(discoveredPaths, "source_paths");
  if (JSON.stringify(actual) !== JSON.stringify(expected)) refuse("source_file_set_changed");
}

export function stagingIngressCompositionIdentity(config, sources) {
  const sourceFiles = INGRESS_SOURCE_PATHS.map((path) => {
    const bytes = sources.get(path);
    if (!(bytes instanceof Uint8Array)) refuse(`missing_source_${path}`);
    return { path, sha256: sha256(bytes) };
  });
  const projection = projectStagingIngressConfiguration(config);
  const canonical = JSON.stringify({ schema: "solid-hns-ingress-fingerprint-v1", sourceFiles, projection });
  return `solid-hns-ingress-sha256:${sha256(canonical)}`;
}

async function discoverIngressSourcePaths(directory, prefix = "src/hns-ingress") {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...(await discoverIngressSourcePaths(join(directory, entry.name), relative)));
    } else if (entry.isSymbolicLink()) {
      refuse("symlinked_ingress_source");
    } else if (
      /\.(?:[cm]?[jt]s|tsx|jsx)$/u.test(entry.name) &&
      !/\.test\.(?:[cm]?[jt]s|tsx|jsx)$/u.test(entry.name)
    ) {
      paths.push(relative);
    }
  }
  return paths;
}

export async function readStagingIngressCompositionInputs(root = repositoryRoot) {
  const discovered = await discoverIngressSourcePaths(join(root, "src/hns-ingress"));
  assertIngressSourcePaths([...discovered, "src/worker.ts"]);
  const sources = new Map();
  for (const path of INGRESS_SOURCE_PATHS) sources.set(path, await readFile(join(root, path)));
  const config = JSON.parse(await readFile(join(root, "wrangler.jsonc"), "utf8"));
  return { config, sources };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) refuse("unexpected_argument");
  const { config, sources } = await readStagingIngressCompositionInputs();
  console.log(stagingIngressCompositionIdentity(config, sources));
}
