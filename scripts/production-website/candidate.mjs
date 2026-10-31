import assert from "node:assert/strict";
import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { websiteArtifactDigest } from "../website-production-artifacts.mjs";
import { checkWebsiteProductionConfig } from "../website-production-config.mjs";
import { APP_REPO, APP_SOURCE, ARTIFACT, CONFIG_PATH, NODE, PREPARED_RECEIPT, WRANGLER_BIN } from "./paths.mjs";
import { digest, hash } from "./contract.mjs";

/** A fixed prepared artifact is read, never rebuilt, moved or relabelled. */
export async function preparedCandidate() {
  const receiptBytes = await readFile(join(APP_REPO, "dist/website-production-prepared.json"));
  assert.equal(hash(receiptBytes), PREPARED_RECEIPT);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(receipt.kind, "pirate-website-production-prepared-v1"); assert.equal(receipt.sourceSha, APP_SOURCE);
  assert.equal(receipt.buildSha256, ARTIFACT); assert.equal(await websiteArtifactDigest(APP_REPO), ARTIFACT);
  const configBytes = await readFile(join(APP_REPO, CONFIG_PATH));
  const config = JSON.parse(configBytes.toString("utf8"));
  checkWebsiteProductionConfig(JSON.parse(await readFile(join(APP_REPO, "wrangler.jsonc"), "utf8")), config);
  const modules = [], client = [];
  async function visit(directory, root, result, moduleOnly = false) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name); const stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink() && await realpath(path) === resolve(path));
      if (stat.isDirectory()) await visit(path, root, result, moduleOnly);
      else {
        assert.ok(stat.isFile()); if (moduleOnly && !/\.(?:js|mjs)$/u.test(entry.name)) continue;
        const bytes = await readFile(path); result.push({ name: relative(root, path).split("\\").join("/"), sha256: hash(bytes), bytes: bytes.length });
      }
    }
  }
  await visit(join(APP_REPO, "dist/ssr"), join(APP_REPO, "dist/ssr"), modules, true);
  await visit(join(APP_REPO, "dist/client"), join(APP_REPO, "dist/client"), client);
  modules.sort((a, b) => a.name.localeCompare(b.name)); client.sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(modules.length, 188); assert.ok(modules.some(row => row.name === "index.js")); assert.ok(client.length > 0);
  const uploader = join(APP_REPO, "node_modules/wrangler/wrangler-dist/cli.js");
  const uploaderInputs = {
    node_sha256: hash(await readFile(NODE)), bin_sha256: hash(await readFile(WRANGLER_BIN)), cli_sha256: hash(await readFile(uploader)),
    package_sha256: hash(await readFile(join(APP_REPO, "node_modules/wrangler/package.json"))),
    lock_sha256: hash(await readFile(join(APP_REPO, "bun.lock"))), patch_sha256: hash(await readFile(join(APP_REPO, "patches/wrangler@4.123.0.patch"))),
  };
  const uploaderSha = digest(uploaderInputs);
  assert.equal(JSON.parse(await readFile(join(APP_REPO, "node_modules/wrangler/package.json"), "utf8")).version, "4.123.0");
  return { source: APP_SOURCE, artifact_sha256: ARTIFACT, receipt_sha256: PREPARED_RECEIPT,
    config_sha256: hash(configBytes), modules_sha256: digest(modules), client_sha256: digest(client), uploader_sha256: uploaderSha,
    modules, client, config, uploader_inputs: uploaderInputs };
}

export function criticalAssets(candidate, names) {
  assert.ok(Array.isArray(names) && names.length >= 2 && names.length <= 12);
  const seen = new Set();
  return names.map(name => {
    assert.ok(typeof name === "string" && /^assets\/[a-zA-Z0-9_./-]+$/u.test(name) && !name.includes("..") && !seen.has(name)); seen.add(name);
    const row = candidate.client.find(value => value.name === name); assert.ok(row, "Critical asset not in retained artifact");
    return { ...row };
  });
}
