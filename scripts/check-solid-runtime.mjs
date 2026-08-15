import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designSystemRoot = process.env.WEB_SOLID_DESIGN_SYSTEM_ROOT
  ? resolve(process.env.WEB_SOLID_DESIGN_SYSTEM_ROOT)
  : resolve(appRoot, "../pirate-solid-design-system");
const appRequire = createRequire(resolve(appRoot, "package.json"));

function packageRoot(specifier) {
  let entry;
  let directory;
  try {
    entry = appRequire.resolve(specifier);
    directory = dirname(realpathSync(entry));
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    directory = realpathSync(resolve(appRoot, "node_modules", specifier));
  }
  while (!existsSync(resolve(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Could not find package root for ${specifier}`);
    directory = parent;
  }
  return directory;
}

const appSolid = packageRoot("solid-js");
const appWeb = packageRoot("@solidjs/web");
const kobalteRoot = packageRoot("@kobalte/core");
const aliases = {
  solid: appSolid,
  web: appWeb,
};

for (const [label, target] of Object.entries(aliases)) {
  if (realpathSync(target) !== (label === "solid" ? appSolid : appWeb)) throw new Error(`Duplicate Solid runtime alias for ${label}: ${target}`);
}

const designSystemPackage = resolve(designSystemRoot, "package.json");
const designSystemConfig = JSON.parse(readFileSync(designSystemPackage, "utf8"));
const designRequire = createRequire(designSystemPackage);

function optionalResolve(requireInstance, specifier) {
  try {
    return realpathSync(requireInstance.resolve(specifier));
  } catch {
    return null;
  }
}

const designSolid = optionalResolve(designRequire, "solid-js");
const designWeb = optionalResolve(designRequire, "@solidjs/web");
const peerNormalized = designSystemConfig.peerDependencies?.["solid-js"] === "2.0.0-rc.0"
  && designSystemConfig.peerDependencies?.["@solidjs/web"] === "2.0.0-rc.0"
  && !designSystemConfig.dependencies?.["solid-js"]
  && !designSystemConfig.dependencies?.["@solidjs/web"];

if (designSolid && designSolid !== resolve(appSolid, "dist/server.js") && !designSolid.startsWith(appSolid)) {
  throw new Error(`Design system resolves a second solid-js copy: ${designSolid}`);
}
if (designWeb && designWeb !== resolve(appWeb, "dist/server.js") && !designWeb.startsWith(appWeb)) {
  throw new Error(`Design system resolves a second @solidjs/web copy: ${designWeb}`);
}
if (!peerNormalized) {
  throw new Error("Design system must declare solid-js and @solidjs/web as peerDependencies only");
}

const kobaltePackage = JSON.parse(readFileSync(resolve(kobalteRoot, "package.json"), "utf8"));
const expectedKobalteVersion = "2.0.0-alpha.0";
if (kobaltePackage.version !== expectedKobalteVersion) {
  throw new Error(`Kobalte must remain pinned to ${expectedKobalteVersion}; found ${kobaltePackage.version}`);
}

const buttonBuildFiles = readdirSync(resolve(kobalteRoot, "dist/button"))
  .filter((file) => file.endsWith(".jsx"));
const buttonBuild = buttonBuildFiles
  .map((file) => readFileSync(resolve(kobalteRoot, "dist/button", file), "utf8"))
  .find((source) => source.includes("function ButtonRoot"));
const nativeButtonPatch = "return <button {...others} type={mergedProps.type} disabled={mergedProps.disabled}>{mergedProps.children}</button>;";
const polymorphicGuard = "if (mergedProps.as && mergedProps.as !== \"button\")";
if (!buttonBuild || !buttonBuild.includes(nativeButtonPatch) || !buttonBuild.includes(polymorphicGuard)) {
  throw new Error("Kobalte Solid 2 hydration patch is missing or did not apply");
}

console.log(JSON.stringify({
  appSolid,
  appWeb,
  designSystemPackage,
  designSolid,
  designWeb,
  peerNormalized,
  kobalteVersion: kobaltePackage.version,
  kobaltePatch: true,
  dedupe: ["solid-js", "@solidjs/web"],
  note: "Vite aliases force the linked design-system source to the app runtime; peer dependency normalization remains a design-system-owned prerequisite.",
}, null, 2));
