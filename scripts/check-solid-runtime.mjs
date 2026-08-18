import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designSystemRoot = resolve(appRoot, "packages/solid-ui");
const appRequire = createRequire(resolve(appRoot, "package.json"));

function packageRoot(specifier, requireInstance = appRequire) {
  let entry;
  let directory;
  try {
    entry = requireInstance.resolve(specifier);
    directory = dirname(realpathSync(entry));
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    directory = realpathSync(resolve(dirname(requireInstance.resolve("./package.json")), "node_modules", specifier));
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
const kobalteRoot = packageRoot("@kobalte/core", designRequire);

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

const provenancePath = resolve(appRoot, "vendor/kobalte-core-provenance.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const provenanceTarball = resolve(appRoot, "vendor", provenance.build.tarball);
const tarballSha512 = createHash("sha512").update(readFileSync(provenanceTarball)).digest("hex");
if (tarballSha512 !== provenance.build.sha512) {
  throw new Error(`Kobalte provenance hash mismatch: expected ${provenance.build.sha512}, found ${tarballSha512}`);
}
const provenancePatch = resolve(appRoot, provenance.build.patch.path);
const patchSha512 = createHash("sha512").update(readFileSync(provenancePatch)).digest("hex");
if (patchSha512 !== provenance.build.patch.sha512) {
  throw new Error(`Kobalte patch provenance hash mismatch: expected ${provenance.build.patch.sha512}, found ${patchSha512}`);
}
if (
  provenance.source?.repository !== "https://github.com/kobaltedev/kobalte.git"
  || provenance.source?.commit !== "a892187065cf7e0d07e91db02310bd28a5619236"
  || provenance.source?.branch !== "solid2"
  || provenance.source?.packagePath !== "packages/core"
) {
  throw new Error("Kobalte provenance must identify the official solid2 package at commit a892187065cf7e0d07e91db02310bd28a5619236");
}
const kobalteButtonBuild = readFileSync(resolve(kobalteRoot, "dist/button/DvspU6cJ.jsx"), "utf8");
if (!kobalteButtonBuild.includes("if (mergedProps.as && mergedProps.as !== \"button\")") || !kobalteButtonBuild.includes("return <button {...others}")) {
  throw new Error("Kobalte Solid 2 hydration patch is missing from the vendored official build");
}

console.log(JSON.stringify({
  appSolid,
  appWeb,
  designSystemPackage,
  designSolid,
  designWeb,
  peerNormalized,
  kobalteVersion: kobaltePackage.version,
  kobalteSourceCommit: provenance.source.commit,
  kobalteTarballSha512: tarballSha512,
  kobaltePatchSha512: patchSha512,
  kobaltePatch: true,
  dedupe: ["solid-js", "@solidjs/web"],
  note: "The internal solid-ui package is resolved from this repository and shares the app's deduped Solid runtime.",
}, null, 2));
