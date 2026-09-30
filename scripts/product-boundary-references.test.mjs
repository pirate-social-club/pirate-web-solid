import assert from "node:assert/strict";
import test from "node:test";
import { hasForbiddenProductReference } from "./product-boundary-references.mjs";

test("refuses retired API references in URLs and built JSON", () => {
  for (const value of [
    "https://api-staging.pirate.sc/v1",
    "api-staging.pirate.sc",
    '{"origin":"https://api-staging.pirate.sc:443"}',
    "fetch('https://api-staging.pirate.sc?query=value')",
  ]) assert.equal(hasForbiddenProductReference(value), true, value);
});

test("permits the separately approved HNS API host and api-next hosts", () => {
  for (const value of [
    "https://hns-community-api-staging.pirate.sc",
    '{"authority":"https://hns-community-api-staging.pirate.sc"}',
    "https://api-next-staging.pirate.sc",
    "https://api-next.pirate.sc",
  ]) assert.equal(hasForbiddenProductReference(value), false, value);
});

test("retains the legacy workspace and runtime package refusals", () => {
  assert.equal(hasForbiddenProductReference("/workspace/web/solid/src/worker.ts"), true);
  assert.equal(hasForbiddenProductReference("@pirate/web-platform"), true);
});
