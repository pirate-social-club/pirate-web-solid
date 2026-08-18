import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const requireBuild = process.argv.includes("--require-build");
const sourceExtensions = new Set([".cjs", ".css", ".js", ".json", ".mjs", ".ts", ".tsx"]);
const importReactPattern = /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:react|react-dom)(?:["'/]|$)/u;
const forbiddenReferences = [
  /@pirate\/web-platform/u,
  /(?:^|[\\/])web[\\/]solid(?:[\\/]|$)/u,
  /api-staging\.pirate\.sc/u,
];

const violations = [];
const scannedSourceFiles = [];
const scannedAssetFiles = [];

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(filePath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(filePath);
  }
  return files;
}

function scanFile(filePath, scope, collection) {
  const text = readFileSync(filePath, "utf8");
  collection.push(path.relative(root, filePath));
  if (importReactPattern.test(text)) {
    violations.push(`${scope}: React import in ${path.relative(root, filePath)}`);
  }
  for (const pattern of forbiddenReferences) {
    if (pattern.test(text)) {
      violations.push(`${scope}: forbidden legacy reference in ${path.relative(root, filePath)}`);
    }
  }
}

for (const directory of ["src", "packages/solid-ui/src"]) {
  for (const filePath of walk(path.join(root, directory))) {
    scanFile(filePath, "source", scannedSourceFiles);
  }
}

for (const packagePath of ["package.json", "packages/solid-ui/package.json"]) {
  const packageFile = path.join(root, packagePath);
  const packageJson = JSON.parse(readFileSync(packageFile, "utf8"));
  const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
  for (const dependency of runtimeDependencies) {
    if (/^(?:react|react-dom)(?:$|[-/])/u.test(dependency)) {
      violations.push(`runtime dependency: React package ${dependency} in ${packagePath}`);
    }
  }
}

const assetDirectories = ["dist/client", "dist/ssr"];
const missingAssetDirectories = assetDirectories.filter(
  directory => !statSafe(path.join(root, directory)),
);
for (const directory of assetDirectories) {
  const directoryPath = path.join(root, directory);
  if (!statSafe(directoryPath)) continue;
  for (const filePath of walk(directoryPath)) {
    scanFile(filePath, "Worker asset", scannedAssetFiles);
    if (path.basename(filePath).toLowerCase().includes("storybook")) {
      violations.push(`Worker asset: Storybook output leaked into ${path.relative(root, filePath)}`);
    }
  }
}

if (requireBuild && missingAssetDirectories.length > 0) {
  violations.push(`Worker asset: missing production build directories: ${missingAssetDirectories.join(", ")}`);
}

if (violations.length > 0) {
  console.error(JSON.stringify({ violations }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  productionSourceFiles: scannedSourceFiles.length,
  workerAssetFiles: scannedAssetFiles.length,
  productionRuntimeReactDependencies: 0,
  storybookManager: "dev-only; .storybook and storybook-static are excluded from Worker asset scan",
  buildRequired: requireBuild,
}, null, 2));

function statSafe(filePath) {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
