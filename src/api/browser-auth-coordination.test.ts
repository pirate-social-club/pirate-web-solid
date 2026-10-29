// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BROWSER_AUTH_CHANGE_EVENT, captureBrowserSessionFence, changeBrowserAuthentication, isCurrentBrowserSessionFence, withBrowserAuthLock, type BrowserAuthChange } from "./browser-auth-coordination.ts";

const changes: BrowserAuthChange[] = [];
const observe = (event: Event) => {
  // SAFETY: only the app-owned coordination event is subscribed here.
  changes.push((event as CustomEvent<BrowserAuthChange>).detail);
};
beforeEach(() => {
  changes.length = 0;
  window.addEventListener(BROWSER_AUTH_CHANGE_EVENT, observe);
  vi.stubGlobal("navigator", { locks: { request: <T>(_name: string, _options: LockOptions, action: () => Promise<T>) => action() } });
});
afterEach(() => {
  window.removeEventListener(BROWSER_AUTH_CHANGE_EVENT, observe);
  localStorage.removeItem("pirate:browser-session-change:v1");
  vi.unstubAllGlobals();
});

test("a complete logout acknowledgement publishes only credential-free invalidation", async () => {
  const prior = captureBrowserSessionFence();
  await changeBrowserAuthentication("logout", async () => Response.json({ status: "ok" }));
  expect(changes).toEqual(["changing", "logout"]);
  expect(isCurrentBrowserSessionFence(prior)).toBe(false);
  const marker = JSON.parse(localStorage.getItem("pirate:browser-session-change:v1")!);
  expect(Object.keys(marker).sort()).toEqual(["kind", "nonce"]);
  expect(marker.kind).toBe("logout");
  expect(marker.nonce).toMatch(/^[\da-f-]{36}$/u);
});

test.each(["truncated", "extra-field", "wrong-status", "server-error"])("%s logout result never announces a confirmed sign-out", async kind => {
  const response = kind === "truncated" ? new Response('{"status":')
    : kind === "extra-field" ? Response.json({ status: "ok", unexpected: true })
    : kind === "wrong-status" ? Response.json({ status: "unconfirmed" })
    : new Response(null, { status: 500 });
  await changeBrowserAuthentication("logout", async () => response);
  expect(changes).toEqual(["changing", "changed"]);
});

test("an unavailable logout propagates its error and requests a reread without confirming it", async () => {
  await expect(changeBrowserAuthentication("logout", async () => { throw new TypeError("offline"); })).rejects.toThrow("offline");
  expect(changes).toEqual(["changing", "changed"]);
});

test("missing cross-tab locks keeps explicit sign-in available and refuses automatic cookie renewal", async () => {
  vi.stubGlobal("navigator", {});
  await expect(withBrowserAuthLock(async () => "explicit")).resolves.toBe("explicit");
  const renew = vi.fn(async () => "renewed");
  await expect(withBrowserAuthLock(renew, undefined, true)).rejects.toThrow("session_renewal_unavailable");
  expect(renew).not.toHaveBeenCalled();
});
