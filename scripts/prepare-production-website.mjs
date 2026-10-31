import { spawnSync } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertPublishedProductionSource } from "./hns-production-source-preflight.mjs";
import { checkWebsiteProductionConfig } from "./website-production-config.mjs";
import { websiteArtifactDigest } from "./website-production-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const receipt = new URL("../dist/website-production-prepared.json", import.meta.url);
function refuse(reason) { throw new Error("website_production_refused:" + reason); }
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", timeout: 600_000 });
  if (result.error || result.status !== 0) refuse("preparation_command_failed");
}
async function config() {
  return checkWebsiteProductionConfig(
    JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")),
    JSON.parse(await readFile(new URL("../dist/ssr/wrangler.json", import.meta.url), "utf8")),
  );
}
async function main() {
  if (process.argv.length !== 3 || !["--prepare", "--check"].includes(process.argv[2])) refuse("usage_prepare_or_check");
  if (process.env.SOLID_API_NEXT_FIXTURE_ORIGIN !== undefined) refuse("fixture_api_override");
  const source = assertPublishedProductionSource(root);
  if (process.argv[2] === "--prepare") {
    run("bun", ["run", "build"], { ...process.env, CLOUDFLARE_ENV: "production", PIRATE_WEBSITE_ONLY_RELEASE: "1" });
    await config();
    run("bunx", ["wrangler", "deploy", "--dry-run", "--config", "dist/ssr/wrangler.json"], process.env);
    if (assertPublishedProductionSource(root) !== source) refuse("source_changed");
    const value = { kind: "pirate-website-production-prepared-v1", sourceSha: source,
      buildSha256: await websiteArtifactDigest(root), configuration: await config() };
    const file = await open(receipt, "wx", 0o600);
    try { await file.writeFile(JSON.stringify(value) + "\n"); await file.sync(); } finally { await file.close(); }
    console.log(JSON.stringify(value));
  } else {
    const value = JSON.parse(await readFile(receipt, "utf8"));
    if (value.kind !== "pirate-website-production-prepared-v1" || value.sourceSha !== source
      || value.buildSha256 !== await websiteArtifactDigest(root)) refuse("prepared_build_or_source_changed");
    await config();
    if (assertPublishedProductionSource(root) !== source) refuse("source_changed");
    console.log(JSON.stringify({ event: "website_production_prepared_verified", sourceSha: source }));
  }
}
main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("website_production_refused:")
    ? error.message : "website_production_refused:preparation_failed");
  process.exitCode = 1;
});
