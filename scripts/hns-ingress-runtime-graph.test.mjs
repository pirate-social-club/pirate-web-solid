import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIngressRuntimeSources, runtimeEdges } from "./hns-ingress-runtime-graph.mjs";

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
