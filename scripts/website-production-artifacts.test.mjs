import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { websiteArtifactDigest } from "./website-production-artifacts.mjs";

test("binds server module, generated config and public assets; rejects symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "website-artifact-test-"));
  try {
    for (const d of ["ssr", "client"]) await mkdir(join(root, "dist", d), { recursive: true });
    const files = ["ssr/index.js", "ssr/wrangler.json", "client/app.js"];
    for (const path of files) await writeFile(join(root, "dist", path), "original");
    const before = await websiteArtifactDigest(root);
    for (const path of files) {
      await writeFile(join(root, "dist", path), "changed");
      assert.notEqual(await websiteArtifactDigest(root), before);
      await writeFile(join(root, "dist", path), "original");
    }
    await symlink(join(root, "dist", "ssr/index.js"), join(root, "dist", "client/escape.js"));
    await assert.rejects(websiteArtifactDigest(root), /unsupported_artifact/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
