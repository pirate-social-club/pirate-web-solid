import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const production = config.env?.production;

assert.equal(config.account_id, "08a4c22cf52e2ecae883e36f80a33f4a");
assert.deepEqual(production, {
  name: "pirate-web-solid-production",
  workers_dev: true,
  preview_urls: false,
  routes: [{ pattern: "pirate.sc", custom_domain: true }],
  vars: {
    API_NEXT_ORIGIN: "https://api-next.pirate.sc",
    VERIFICATION_UI_ENABLED: "true",
    PRIVY_APP_ID: "cmnbdx9xk00ty0clapn2q8pdj",
  },
});
assert.notEqual(production.vars.API_NEXT_ORIGIN, config.env.staging.vars.API_NEXT_ORIGIN);
console.log("production-config: exact canonical production origin verified");
