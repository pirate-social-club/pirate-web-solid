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
  "HNS_HANDLE_HOST_CANONICAL_ORIGIN",
  "HNS_HANDLE_HOST_PUBLIC_API_ORIGIN",
  "HNS_HANDLE_HOST_ACCESS_ISSUER",
  "HNS_HANDLE_HOST_ACCESS_JWKS_URL",
  "HNS_HANDLE_HOST_ACCESS_AUDIENCE",
  "HNS_HANDLE_HOST_AUTHORITY_ORIGIN",
  "HNS_FORWARDER_V3_KEY_REGISTRY_REFERENCE",
  "HNS_FORWARDER_V3_KEY_REGISTRY_VERSION",
  "HNS_FORWARDER_V3_FRESHNESS_WINDOW_SECONDS",
  "HNS_FORWARDER_V3_FUTURE_CLOCK_SKEW_SECONDS",
]);

// These values intentionally change after the manifest identity is chosen.
const excludedVariableNames = new Set([
  "HNS_COMMUNITY_APP_INGRESS_ENABLED",
  "HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE",
  "HNS_HANDLE_HOST_INGRESS_ENABLED",
  "HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE",
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

function projectIngressConfiguration(config, packageJson, environment) {
  if (environment !== "staging" && environment !== "production") refuse("invalid_environment");
  const target = config?.env?.[environment];
  const vars = target?.vars;
  if (typeof vars !== "object" || vars === null) refuse("missing_" + environment + "_vars");

  const protectedVars = {};
  for (const name of protectedVariableNames) protectedVars[name] = stringValue(vars[name], name);
  if (vars.HNS_COMMUNITY_APP_INGRESS_ENABLED !== "true" || vars.HNS_HANDLE_HOST_INGRESS_ENABLED !== "true") {
    refuse(environment + "_ingress_must_be_enabled");
  }
  if (vars.HNS_HANDLE_HOST_INGRESS_ORIGIN !== vars.HNS_COMMUNITY_APP_INGRESS_ORIGIN) {
    refuse(environment + "_ingress_origin_mismatch");
  }
  if (vars.HNS_HANDLE_HOST_GATEWAY_DEPLOYMENT_REFERENCE !== vars.HNS_COMMUNITY_APP_GATEWAY_DEPLOYMENT_REFERENCE) {
    refuse(environment + "_gateway_reference_mismatch");
  }
  for (const name of Object.keys(vars)) {
    if (
      (name.startsWith("HNS_COMMUNITY_APP_") ||
        name.startsWith("HNS_FORWARDER_V3_") ||
        name.startsWith("HNS_HANDLE_HOST_")) &&
      !protectedVariableNames.includes(name) &&
      !excludedVariableNames.has(name)
    ) {
      refuse(`unbound_variable_${name}`);
    }
  }

  const apiClientDependency = stringValue(
    packageJson?.dependencies?.["@pirate/api-client"],
    "api_client_dependency",
  );
  if (!/^file:vendor\/api-client\/pirate-api-client-\d+\.\d+\.\d+(?:-[a-f0-9]{8})?\.tgz$/u.test(apiClientDependency)) {
    refuse("unpinned_api_client_dependency");
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
  const routes = target.routes;
  if (!Array.isArray(routes)) refuse("missing_" + environment + "_routes");
  const matchingRoutes = routes.filter((route) => route?.pattern === protectedHost);
  if (
    matchingRoutes.length !== 1 ||
    matchingRoutes[0].custom_domain !== true ||
    JSON.stringify(Object.keys(matchingRoutes[0]).sort()) !== JSON.stringify(["custom_domain", "pattern"])
  ) {
    refuse("protected_route_mismatch");
  }

  const replayBindings = target?.durable_objects?.bindings;
  if (!Array.isArray(replayBindings)) refuse("missing_replay_bindings");
  if (
    replayBindings.filter((binding) => binding?.name === "HNS_COMMUNITY_APP_REPLAY").length !== 1
  ) {
    refuse("replay_binding_mismatch");
  }
  if (!Array.isArray(config.migrations)) refuse("missing_replay_migrations");

  return {
    schema: "pirate-solid-hns-" + environment + "-ingress-composition-v3",
    main: stringValue(config.main, "worker_entry"),
    compatibility_date: stringValue(config.compatibility_date, "compatibility_date"),
    compatibility_flags: uniqueSortedStrings(config.compatibility_flags, "compatibility_flags"),
    protected_route: matchingRoutes[0],
    protected_vars: protectedVars,
    api_client_dependency: apiClientDependency,
    required_secret_names: uniqueSortedStrings(target?.secrets?.required, "required_secrets"),
    replay_bindings: [...replayBindings].sort((left, right) => left.name.localeCompare(right.name)),
    migrations: config.migrations,
  };
}

export function projectStagingIngressConfiguration(config, packageJson) {
  return projectIngressConfiguration(config, packageJson, "staging");
}

export function projectProductionIngressConfiguration(config, packageJson) {
  return projectIngressConfiguration(config, packageJson, "production");
}

export function assertIngressSourcePaths(discoveredPaths) {
  const expected = [...INGRESS_SOURCE_PATHS].sort();
  const actual = uniqueSortedStrings(discoveredPaths, "source_paths");
  if (JSON.stringify(actual) !== JSON.stringify(expected)) refuse("source_file_set_changed");
}

function ingressCompositionIdentity(config, sources, packageJson, environment) {
  const sourceFiles = INGRESS_SOURCE_PATHS.map((path) => {
    const bytes = sources.get(path);
    if (!(bytes instanceof Uint8Array)) refuse(`missing_source_${path}`);
    return { path, sha256: sha256(bytes) };
  });
  const projection = projectIngressConfiguration(config, packageJson, environment);
  const canonical = JSON.stringify({ schema: "solid-hns-ingress-fingerprint-v3", sourceFiles, projection });
  return `solid-hns-ingress-sha256:${sha256(canonical)}`;
}

export function stagingIngressCompositionIdentity(config, sources, packageJson) {
  return ingressCompositionIdentity(config, sources, packageJson, "staging");
}

export function productionIngressCompositionIdentity(config, sources, packageJson) {
  return ingressCompositionIdentity(config, sources, packageJson, "production");
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
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  return { config, sources, packageJson };
}

export const readIngressCompositionInputs = readStagingIngressCompositionInputs;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) refuse("unexpected_argument");
  const { config, sources, packageJson } = await readStagingIngressCompositionInputs();
  console.log(stagingIngressCompositionIdentity(config, sources, packageJson));
}
