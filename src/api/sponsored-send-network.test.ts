import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { BASE_SEPOLIA_SPONSORED_SEND, BASE_SPONSORED_SEND, sponsoredSendNetwork } from "./sponsored-send-network.ts";

test("each deployment's configured canonical origin names its sponsored network", async () => {
  const config = JSON.parse(await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
  expect(sponsoredSendNetwork(config.env.production.vars.PUBLIC_APP_CANONICAL_ORIGIN)).toBe(BASE_SPONSORED_SEND);
  expect(sponsoredSendNetwork(config.env.staging.vars.PUBLIC_APP_CANONICAL_ORIGIN)).toBe(BASE_SEPOLIA_SPONSORED_SEND);
  expect(sponsoredSendNetwork(config.vars.PUBLIC_APP_CANONICAL_ORIGIN)).toBe(BASE_SEPOLIA_SPONSORED_SEND);
});

test("a host name, an inexact origin or no origin names no network", () => {
  for (const value of [
    undefined, "", "pirate.sc", "web-next-staging.pirate.sc", "localhost",
    "app.8s28", "https://app.8s28", "https://membertest.8s28", "https://app.a18n",
    "https://pirate.sc/", "https://PIRATE.sc", "http://pirate.sc", "https://evil.pirate.sc",
    "https://web-next-staging.pirate.sc.example", "constructor", "__proto__",
  ]) {
    expect(sponsoredSendNetwork(value)).toBeUndefined();
  }
});
