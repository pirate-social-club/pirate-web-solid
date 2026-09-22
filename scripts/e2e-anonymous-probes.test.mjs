import { test } from "node:test";
import assert from "node:assert/strict";
import { isAnonymousSessionProbe } from "../e2e/fixtures/anonymous-probes.ts";

const account = { method: "GET", path: "/api/users/me", status: 401 };
const personas = { method: "GET", path: "/api/personas", status: 401 };

test("accepts concurrent anonymous persona and account probes in either order", () => {
  for (const responses of [[account, personas], [personas, account]]) {
    assert.equal(responses.every(response => isAnonymousSessionProbe(response, responses)), true);
  }
});

test("does not excuse a persona failure without an anonymous account response", () => {
  assert.equal(isAnonymousSessionProbe(personas, []), false);
  assert.equal(isAnonymousSessionProbe(personas, [{ ...account, status: 200 }]), false);
});

test("rejects other endpoints, methods and status codes", () => {
  for (const entry of [
    { ...personas, method: "POST" }, { ...personas, status: 403 },
    { ...personas, status: 500 }, { ...personas, path: "/api/personas/private" },
    { ...personas, path: "/api/communities/test/me/capabilities" },
  ]) assert.equal(isAnonymousSessionProbe(entry, [account]), false);
});
