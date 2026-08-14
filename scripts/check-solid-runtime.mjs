import { createRequire } from "node:module";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designSystemRoot = resolve(appRoot, "../solid-storybook-poc");
const appRequire = createRequire(resolve(appRoot, "package.json"));

function packageRoot(specifier) {
  let directory = dirname(realpathSync(appRequire.resolve(specifier)));
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
console.log(JSON.stringify({
  appSolid,
  appWeb,
  designSystemPackage,
  dedupe: ["solid-js", "@solidjs/web"],
  note: "Vite aliases force the linked design-system source to the app runtime; peer dependency normalization remains a design-system-owned prerequisite.",
}, null, 2));
