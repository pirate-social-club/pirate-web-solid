import { readFile } from "node:fs/promises";
import { checkWebsiteProductionConfig } from "./website-production-config.mjs";

if (process.argv.length !== 2) throw new Error("website_production_refused:unexpected_argument");
const source = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const built = JSON.parse(await readFile(new URL("../dist/ssr/wrangler.json", import.meta.url), "utf8"));
console.log(JSON.stringify(checkWebsiteProductionConfig(source, built)));
