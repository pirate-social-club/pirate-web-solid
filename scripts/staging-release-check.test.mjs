import assert from "node:assert/strict";
import test from "node:test";
import { checkDirectStaging, checkStagingRelease } from "./staging-release-check.mjs";

function serving(overrides = {}) {
  const fixtures = {
    "https://web-next-staging.pirate.sc/": [200, "text/html", '<div id="app-root"></div><script type="module" src="/assets/entry-client-proof.js"></script>'],
    "https://web-next-staging.pirate.sc/assets/entry-client-proof.js": [200, "text/javascript", "export {};"],
    "https://api-next-staging.pirate.sc/health": [200, "application/json", '{"status":"ok"}'],
    "https://web-next-staging.pirate.sc/api/health": [200, "application/json", '{"status":"ok"}'],
    "https://web-next-staging.pirate.sc/api/users/me": [401, "application/json", '{"error":{"code":"auth_error"}}'],
    ...overrides,
  };
  const requests = [];
  return {
    requests,
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(options.credentials, "omit");
      assert.ok(options.signal instanceof AbortSignal);
      requests.push(url);
      const [status, type, body] = fixtures[url];
      return new Response(body, { status, headers: { "content-type": type } });
    },
  };
}

test("direct staging checks app, actual entry bundle, API and anonymous session boundary", async () => {
  const fixture = serving();
  await checkDirectStaging(fixture.fetcher);
  assert.equal(fixture.requests.length, 5);
});

test("direct staging refuses wrong app, missing bundle, unhealthy API and broken auth boundary", async () => {
  for (const [url, reply] of [
    ["https://web-next-staging.pirate.sc/", [421, "text/html", "misdirected"]],
    ["https://web-next-staging.pirate.sc/", [200, "text/html", "upstream login"]],
    ["https://web-next-staging.pirate.sc/assets/entry-client-proof.js", [404, "text/html", "missing"]],
    ["https://api-next-staging.pirate.sc/health", [200, "application/json", '{"status":"failed"}']],
    ["https://web-next-staging.pirate.sc/api/health", [500, "application/json", "{}"]],
    ["https://web-next-staging.pirate.sc/api/users/me", [200, "application/json", "{}"]],
    ["https://web-next-staging.pirate.sc/api/users/me", [401, "application/json", '{"error":{"code":"other"}}']],
  ]) {
    await assert.rejects(checkDirectStaging(serving({ [url]: reply }).fetcher));
  }
  await assert.rejects(checkDirectStaging(async () => { throw new Error("network unavailable"); }));
});

test("HNS failure is reported for staging releases and refuses explicit HNS acceptance", async () => {
  for (const requireHns of [false, true]) {
    const reports = [];
    const check = checkStagingRelease({
      directCheck: async () => ({ origin: "staging" }),
      hnsCheck: async () => { throw new Error("8s28 unavailable"); },
      requireHns, report: value => reports.push(value),
    });
    if (requireHns) await assert.rejects(check, /staging_hns_acceptance_failed/u);
    else assert.deepEqual(await check, { direct: "passed", hns: "failed" });
    assert.deepEqual(reports.at(-1), { event: "staging_hns_availability", status: "failed", required: requireHns });
  }
});

test("direct failure always refuses release before HNS and healthy HNS is reported", async () => {
  let hnsCalls = 0;
  await assert.rejects(checkStagingRelease({
    directCheck: async () => { throw new Error("direct unavailable"); },
    hnsCheck: async () => { hnsCalls++; }, requireHns: false, report: () => {},
  }), /direct unavailable/u);
  assert.equal(hnsCalls, 0);
  const reports = [];
  assert.deepEqual(await checkStagingRelease({
    directCheck: async () => ({}), hnsCheck: async () => {},
    requireHns: true, report: value => reports.push(value),
  }), { direct: "passed", hns: "passed" });
  assert.equal(reports.at(-1).status, "passed");
});
