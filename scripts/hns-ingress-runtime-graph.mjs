import { readFile, realpath, lstat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ADAPTER = "src/worker.ts";
// Explicit application callbacks are outside the ingress boundary. Any new
// adapter edge must be classified before identity generation can succeed.
const APPLICATION_EDGES = new Set([
  "virtual:solid-ssr-handler",
  "./api/index.ts",
  "./api/verification-config.ts",
  "./features/posts/public-post/public-post-sitemap.ts",
]);
const SECURITY_EDGES = new Set([
  "./features/profiles/persona-public-profile/persona-public-profile.model.ts",
]);
const PLATFORM_EDGES = new Set(["node:async_hooks", "cloudflare:workers"]);

function refuse(reason) {
  throw new Error(`hns_ingress_identity_refused:${reason}`);
}

export function runtimeEdges(path, bytes) {
  const ast = ts.createSourceFile(path, Buffer.from(bytes).toString("utf8"), ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : /\.[cm]?jsx?$/u.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) refuse(`invalid_source_${path}`);
  const edges = [];
  function literal(node) {
    if (!ts.isStringLiteral(node)) refuse(`computed_load_${path}`);
    edges.push(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (clause && !clause.name && bindings &&
        ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((part) => part.isTypeOnly));
      if (!onlyTypes) literal(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const onlyTypes = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 && node.exportClause.elements.every((part) => part.isTypeOnly));
      if (!onlyTypes) literal(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      refuse(`require_load_${path}`);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (node.arguments.length !== 1) refuse(`unsupported_dynamic_import_${path}`);
      literal(node.arguments[0]);
    } else if (ts.isIdentifier(node) && (node.text === "require" || node.text === "eval" || node.text === "Function")) {
      refuse(`unsupported_runtime_load_${path}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...new Set(edges)].sort();
}

function localPath(from, specifier, sources) {
  if (specifier.startsWith("@pirate/api-client")) refuse(`api_client_value_import_${from}`);
  if (PLATFORM_EDGES.has(specifier)) return null;
  if (!specifier.startsWith(".")) refuse(`unreviewed_runtime_package_${specifier}`);
  const candidate = relative(".", resolve(dirname(from), specifier)).replaceAll("\\", "/");
  if (!candidate.startsWith("src/") || candidate.includes("/../")) refuse(`source_escape_${from}`);
  const exact = sources.has(candidate) ? candidate : null;
  if (exact) return exact;
  // Resolution deliberately supports only the reviewed Worker graph's file
  // forms. New aliases, directory imports and package imports fail closed.
  const choices = [candidate + ".ts", candidate + ".tsx", candidate + ".js", candidate + "/index.ts"];
  const matches = choices.filter((path) => sources.has(path));
  if (matches.length !== 1) refuse(`unresolved_import_${from}_${specifier}`);
  return matches[0];
}

export function ingressRuntimePaths(sources) {
  const worker = sources.get(ADAPTER);
  if (!worker) refuse("missing_worker_adapter");
  const roots = [];
  for (const edge of runtimeEdges(ADAPTER, worker)) {
    if (APPLICATION_EDGES.has(edge)) continue;
    if (!edge.startsWith("./hns-ingress/") && !SECURITY_EDGES.has(edge)) {
      refuse(`unclassified_adapter_edge_${edge}`);
    }
    roots.push(localPath(ADAPTER, edge, sources));
  }
  const reached = new Set([ADAPTER]);
  const pending = roots;
  while (pending.length) {
    const path = pending.pop();
    if (reached.has(path)) continue;
    reached.add(path);
    const bytes = sources.get(path);
    if (!bytes) refuse(`missing_source_${path}`);
    for (const edge of runtimeEdges(path, bytes)) {
      const target = localPath(path, edge, sources);
      if (target !== null) pending.push(target);
    }
  }
  return [...reached].sort();
}

export async function readIngressRuntimeSources(root) {
  const sources = new Map();
  const canonicalRoot = await realpath(root);
  async function load(path) {
    if (sources.has(path)) return;
    const absolute = join(canonicalRoot, path);
    // Reject symlinks in every ancestor, not only the final file.
    let ancestor = canonicalRoot;
    for (const part of path.split("/")) {
      ancestor = join(ancestor, part);
      if ((await lstat(ancestor)).isSymbolicLink()) refuse(`symlinked_source_${path}`);
    }
    const bytes = await readFile(absolute);
    sources.set(path, bytes);
    for (const edge of runtimeEdges(path, bytes)) {
      if (path === ADAPTER && APPLICATION_EDGES.has(edge)) continue;
      if (path === ADAPTER && !edge.startsWith("./hns-ingress/") && !SECURITY_EDGES.has(edge)) {
        refuse(`unclassified_adapter_edge_${edge}`);
      }
      if (edge.startsWith("@pirate/api-client")) refuse(`api_client_value_import_${path}`);
      if (PLATFORM_EDGES.has(edge)) continue;
      if (!edge.startsWith(".")) refuse(`unreviewed_runtime_package_${edge}`);
      const candidate = relative(canonicalRoot, resolve(dirname(absolute), edge)).replaceAll("\\", "/");
      if (!candidate.startsWith("src/")) refuse(`source_escape_${path}`);
      let target = null;
      for (const option of [candidate, candidate + ".ts", candidate + ".tsx", candidate + ".js", candidate + "/index.ts"]) {
        try {
          const stat = await lstat(join(canonicalRoot, option));
          if (stat.isSymbolicLink()) refuse(`symlinked_source_${option}`);
          if (stat.isFile()) { target = option; break; }
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
        }
      }
      if (target === null) refuse(`unresolved_import_${path}_${edge}`);
      await load(target);
    }
  }
  await load(ADAPTER);
  ingressRuntimePaths(sources);
  return sources;
}
