import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const ssrRoot = path.resolve(import.meta.dirname, "../dist/ssr");
// These modules are reachable only through ZKPassport's browser-only loader.
// The loader rejects SSR before importing them; the client build retains its
// own copies. Removing only their SSR copies keeps the Worker under the free
// plan's script-size limit without changing the browser ceremony.
const optionalFiles = new Set();
const assetRoot = path.join(ssrRoot, "assets");
for (const name of await readdir(assetRoot)) {
  if (!name.endsWith(".js")) continue;
  const file = path.join(assetRoot, name);
  const source = await readFile(file, "utf8");
  const size = (await stat(file)).size;
  if (
    /^barretenberg(?:-threads)?-/u.test(name) ||
    source.includes("@aztec/bb.js") ||
    source.includes("barretenberg_wasm") ||
    (size > 100_000 && source.includes("ZKPassport"))
  ) {
    optionalFiles.add(`assets/${name}`);
  }
  if (/^zkpassport-/u.test(name)) {
    for (const match of source.matchAll(/import\("\.\/([^"]+\.js)"\)/gu)) {
      const imported = match[1];
      if (imported !== undefined) optionalFiles.add(`assets/${imported}`);
    }
  }
}

if (optionalFiles.size === 0) {
  throw new Error("Expected browser-only ZKPassport SSR assets were not found");
}

await Promise.all([...optionalFiles].map(file => rm(path.join(ssrRoot, file), { force: true })));
console.log(`Removed ${optionalFiles.size} browser-only SSR asset(s): ${[...optionalFiles].join(", ")}`);
