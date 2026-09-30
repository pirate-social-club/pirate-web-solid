import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingressRuntimePaths, readIngressRuntimeSources, runtimeEdges } from "./hns-ingress-runtime-graph.mjs";

test("the parser distinguishes mixed value imports, empty imports and type-only reexports", () => {
  assert.deepEqual(runtimeEdges("module.ts", Buffer.from(`
    import type { A } from "types";
    import { type A, type B } from "types";
    export type * from "types";
    import { type A, B } from "mixed";
    import {} from "empty";
    export { type A, B } from "mixed";
  `)), ["empty", "mixed"]);
});

test("the parser refuses direct, computed and aliased import.meta loads", () => {
  for (const source of [
    'const modules = import.meta.glob("./payloads/*.ts", { eager: true });',
    'const modules = import.meta["glob"]("./payloads/*.ts", { eager: true });',
    'const meta = import.meta; const modules = meta.glob("./payloads/*.ts");',
    'const path = import.meta.resolve("./security.ts");',
  ]) assert.throws(() => runtimeEdges("module.ts", Buffer.from(source)), /unsupported_import_meta/u);
});

test("in-memory graph refuses extension and index inference on every load form", () => {
  for (const load of [
    'import "./choice";',
    'export * from "./choice";',
    'void import("./choice");',
  ]) {
    const sources = new Map([
      ["src/worker.ts", Buffer.from('import "./hns-ingress/root.ts";')],
      ["src/hns-ingress/root.ts", Buffer.from(load)],
      ["src/hns-ingress/choice.ts", Buffer.from("export const value = 'ts';")],
    ]);
    assert.throws(() => ingressRuntimePaths(sources), /unresolved_import/u);
    sources.set("src/hns-ingress/choice.js", Buffer.from("export const value = 'js';"));
    assert.throws(() => ingressRuntimePaths(sources), /unresolved_import/u);
    sources.delete("src/hns-ingress/choice.ts");
    sources.delete("src/hns-ingress/choice.js");
    sources.set("src/hns-ingress/choice/index.ts", Buffer.from("export const value = 'index';"));
    assert.throws(() => ingressRuntimePaths(sources), /unresolved_import/u);
  }
});

test("filesystem graph refuses the Vite extension-resolution reproduction", async () => {
  const root = await mkdtemp(join(tmpdir(), "hns-exact-import-"));
  try {
    await mkdir(join(root, "src/hns-ingress"), { recursive: true });
    await writeFile(join(root, "src/worker.ts"), 'import "./hns-ingress/root.ts";');
    await writeFile(join(root, "src/hns-ingress/root.ts"), 'import "./choice";');
    await writeFile(join(root, "src/hns-ingress/choice.ts"), "export const value = 'ts';");
    await writeFile(join(root, "src/hns-ingress/choice.js"), "export const value = 'js';");
    await assert.rejects(readIngressRuntimeSources(root), /unresolved_import/u);
    await writeFile(join(root, "src/hns-ingress/choice.js"), "export const value = 'changed-js';");
    await assert.rejects(readIngressRuntimeSources(root), /unresolved_import/u);
    await writeFile(join(root, "src/hns-ingress/root.ts"), 'import "./choice.js";');
    assert.deepEqual([...await readIngressRuntimeSources(root)].map(([path]) => path).sort(), [
      "src/hns-ingress/choice.js", "src/hns-ingress/root.ts", "src/worker.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem graph refuses the Vite glob reproduction", async () => {
  const root = await mkdtemp(join(tmpdir(), "hns-no-glob-"));
  try {
    await mkdir(join(root, "src/hns-ingress/payloads"), { recursive: true });
    await writeFile(join(root, "src/worker.ts"), 'import "./hns-ingress/root.ts";');
    await writeFile(join(root, "src/hns-ingress/root.ts"), 'const modules = import.meta.glob("./payloads/*.ts", { eager: true });');
    await writeFile(join(root, "src/hns-ingress/payloads/security.ts"), "export const safety = 'before';");
    await assert.rejects(readIngressRuntimeSources(root), /unsupported_import_meta/u);
    await writeFile(join(root, "src/hns-ingress/payloads/security.ts"), "export const safety = 'after';");
    await assert.rejects(readIngressRuntimeSources(root), /unsupported_import_meta/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem graph refuses both final-file and directory symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "hns-graph-"));
  try {
    await mkdir(join(root, "src/hns-ingress"), { recursive: true });
    await writeFile(join(root, "src/worker.ts"), 'import "./hns-ingress/root.ts";');
    await writeFile(join(root, "outside.ts"), 'export const outside = true;');
    await symlink(join(root, "outside.ts"), join(root, "src/hns-ingress/root.ts"));
    await assert.rejects(readIngressRuntimeSources(root), /symlinked_source/u);
    await rm(join(root, "src/hns-ingress/root.ts"));
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside/root.ts"), 'export const outside = true;');
    await rm(join(root, "src/hns-ingress"), { recursive: true });
    await symlink(join(root, "outside"), join(root, "src/hns-ingress"));
    await assert.rejects(readIngressRuntimeSources(root), /symlinked_source/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
