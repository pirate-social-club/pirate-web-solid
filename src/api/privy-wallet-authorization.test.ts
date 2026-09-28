import { afterEach, expect, test, vi } from "vitest";
import { MemoryOnlyStorage } from "./privy-session.ts";
import { createRewardWalletSession } from "./reward-wallet-session.ts";
import { clearWalletAuthorization, rememberWalletAuthorization, restoreWalletAuthorization } from "./privy-wallet-authorization.ts";

const subject = "did:privy:wallet-owner";
const token = `header.${btoa(JSON.stringify({ sub: subject }))}.signature`;
const otherToken = `header.${btoa(JSON.stringify({ sub: "did:privy:another-account" }))}.signature`;
const key = "pirate:privy-wallet-authorization:v1";
afterEach(() => vi.unstubAllGlobals());
function tabStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
}

test("restores only the signed-in Privy account in the same tab after a claim return", () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage();
  memory.put("privy:token", token);
  memory.put("privy:refresh_token", "refresh-token");
  memory.put("unrelated-private-key", "must-not-copy");
  expect(rememberWalletAuthorization(memory, token, "app-one", sessionStorage, 1_000)).toBe(true);
  const restored = new MemoryOnlyStorage();
  expect(restoreWalletAuthorization(restored, "app-one", sessionStorage, 1_001)).toEqual({ subject, expiresAt: 3_601_000 });
  expect(restored.get("privy:token")).toBe(token);
  expect(restored.get("privy:refresh_token")).toBe("refresh-token");
  expect(restored.get("unrelated-private-key")).toBeUndefined();
});

test("keeps only the active user's namespaced SDK tokens", () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage();
  memory.put("privy:active-user", subject);
  memory.put("privy:saved-users", JSON.stringify([subject, "did:privy:another-account"]));
  memory.put(`privy:${subject}:token`, token);
  memory.put(`privy:${subject}:refresh_token`, "refresh-token");
  memory.put("privy:did:privy:another-account:token", otherToken);
  expect(rememberWalletAuthorization(memory, token, "app-one", sessionStorage, 1_000)).toBe(true);
  const restored = new MemoryOnlyStorage();
  expect(restoreWalletAuthorization(restored, "app-one", sessionStorage, 1_001)?.subject).toBe(subject);
  expect(restored.get("privy:active-user")).toBe(subject);
  expect(restored.get("privy:saved-users")).toBe(JSON.stringify([subject]));
  expect(restored.get(`privy:${subject}:token`)).toBe(token);
  expect(restored.get("privy:did:privy:another-account:token")).toBeUndefined();
});

test("reopens a wallet session from the tab snapshot without app-cookie signing", async () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage();
  memory.put("privy:active-user", subject);
  memory.put(`privy:${subject}:token`, token);
  expect(rememberWalletAuthorization(memory, token, "app-one", sessionStorage)).toBe(true);
  vi.stubGlobal("window", { sessionStorage });
  const session = await createRewardWalletSession(
    { enabled: true, privyAppId: "app-one" },
    async (_config, storage) => ({
      initialize: async () => undefined,
      getAccessToken: async () => {
        const active = storage.get("privy:active-user");
        const stored = storage.get(`privy:${subject}:token`);
        return active === subject && typeof stored === "string" ? stored : null;
      },
      auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
    }),
    { restoreSaved: true },
  );
  expect(await session.restoreAuthorization()).toBe(true);
  session.dispose();
});

test("refuses a different app or an expired wallet authorization", () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage(); memory.put("privy:token", token);
  rememberWalletAuthorization(memory, token, "app-one", sessionStorage, 1_000);
  expect(restoreWalletAuthorization(new MemoryOnlyStorage(), "app-two", sessionStorage, 1_001)).toBeUndefined();
  expect(sessionStorage.getItem(key)).toBeNull();
  rememberWalletAuthorization(memory, token, "app-one", sessionStorage, 1_000);
  expect(restoreWalletAuthorization(new MemoryOnlyStorage(), "app-one", sessionStorage, 3_601_000)).toBeUndefined();
  expect(sessionStorage.getItem(key)).toBeNull();
});

test("a new sign-in or sign-out clears the old authorization", () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage(); memory.put("privy:token", token);
  rememberWalletAuthorization(memory, token, "app-one", sessionStorage);
  clearWalletAuthorization(sessionStorage);
  expect(restoreWalletAuthorization(new MemoryOnlyStorage(), "app-one", sessionStorage)).toBeUndefined();
  memory.put("privy:token", otherToken);
  expect(rememberWalletAuthorization(memory, otherToken, "app-one", sessionStorage)).toBe(true);
  expect(restoreWalletAuthorization(new MemoryOnlyStorage(), "app-one", sessionStorage)?.subject).toBe("did:privy:another-account");
});

test("does not persist invalid tokens or a missing SDK token", () => {
  const sessionStorage = tabStorage();
  const memory = new MemoryOnlyStorage();
  expect(rememberWalletAuthorization(memory, token, "app-one", sessionStorage)).toBe(false);
  memory.put("privy:token", token);
  expect(rememberWalletAuthorization(memory, "not-a-token", "app-one", sessionStorage)).toBe(false);
  expect(sessionStorage.getItem(key)).toBeNull();
});
