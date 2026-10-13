import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { createProbeClient, type ProbeProvider } from "./telegram-identity-probe-controller.ts";
import type { Storage as PrivyStorage } from "@privy-io/js-sdk-core";
import type { VerificationPublicConfig } from "../../../api/verification-config.ts";
import { VERIFICATION_CONFIG_PATH } from "../../../api/verification-config.ts";
import { TelegramIdentityProbePage } from "./telegram-identity-probe-page.tsx";
import { TELEGRAM_PROBE_APP_ID, TELEGRAM_PROBE_ORIGIN, TELEGRAM_PROBE_PATH } from "./telegram-identity-probe-config.ts";

interface ProviderFixture { storage?: PrivyStorage; login: Mock<ProbeProvider["loginWithCode"]>;
  initialize: Mock<ProbeProvider["initialize"]>; access: Mock<ProbeProvider["getAccessToken"]> }
const sdk: ProviderFixture = { login: vi.fn(), initialize: vi.fn(), access: vi.fn() };
async function provider(_config: VerificationPublicConfig, storage: PrivyStorage): Promise<ProbeProvider> {
  sdk.storage = storage;
  return { initialize: sdk.initialize, getAccessToken: sdk.access, loginWithCode: sdk.login,
    async generateURL() { storage.put("privy:state_code", "expected-state"); storage.put("privy:code_verifier", "temporary-verifier");
      return { url: "https://oauth.telegram.org/auth" }; } };
}
let fetchFixture: Mock<typeof fetch>;
beforeEach(() => {
  vi.clearAllMocks(); sdk.storage = undefined;
  sdk.initialize.mockResolvedValue(undefined); sdk.login.mockResolvedValue(undefined);
  // Deliberately unsigned: this browser observation is not server verification.
  sdk.access.mockResolvedValue(`unused.${btoa(JSON.stringify({ sub: "did:privy:probe123" }))}.unused`);
  fetchFixture = vi.fn<typeof fetch>().mockImplementation(async input => {
    if (input === VERIFICATION_CONFIG_PATH) return Response.json({ enabled: true, privyAppId: TELEGRAM_PROBE_APP_ID });
    throw new Error("Unexpected account, verifier or wallet call");
  });
});
const makeClient = (signal: AbortSignal) => createProbeClient(signal, { fetch: fetchFixture, provider });

describe("identity-only headless client", () => {
  it("uses existing public config, restores only PKCE and explicitly disables both wallets", async () => {
    const client = await makeClient(new AbortController().signal);
    expect(await client.start()).toEqual({ url: "https://oauth.telegram.org/auth", state: "expected-state", verifier: "temporary-verifier" });
    const fingerprint = await client.finish({ code: "one-time-code", state: "expected-state" }, "temporary-verifier", new AbortController().signal);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(sdk.storage?.get("privy:code_verifier")).toBe("temporary-verifier");
    expect(sdk.login).toHaveBeenCalledWith("one-time-code", "expected-state", "telegram", undefined, "login-or-sign-up",
      { embedded: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } } });
    expect(fetchFixture.mock.calls.map(call => call[0])).toEqual([VERIFICATION_CONFIG_PATH]);
    client.clear(); expect(sdk.storage?.getKeys()).toEqual([]);
  });
  it("does not use an identity token or submit tokens to a website verifier", async () => {
    const client = await makeClient(new AbortController().signal);
    await client.finish({ code: "one-time-code", state: "expected-state" }, "temporary-verifier", new AbortController().signal);
    expect(fetchFixture).toHaveBeenCalledOnce(); client.clear();
  });
  it("does not report completion if cancellation arrives during exchange", async () => {
    const controller = new AbortController(); sdk.login.mockImplementation(async () => { controller.abort(); });
    const client = await makeClient(controller.signal);
    await expect(client.finish({ code: "one-time-code", state: "expected-state" }, "temporary-verifier", controller.signal)).rejects.toThrow("probe_cancelled");
    expect(sdk.access).not.toHaveBeenCalled(); client.clear();
  });
  it("refuses another provider application before SDK initialization", async () => {
    fetchFixture.mockResolvedValue(Response.json({ enabled: true, privyAppId: "production-app" }));
    await expect(makeClient(new AbortController().signal)).rejects.toThrow("probe_unavailable");
    expect(sdk.initialize).not.toHaveBeenCalled();
  });
  it("renders same-tab sign-in and clears a cached Back restoration without a popup or account connection", async () => {
    const values = new Map<string, string>();
    const tab = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const navigate = vi.fn(), container = document.createElement("div"); document.body.appendChild(container);
    let cleanup = () => {};
    createRoot(dispose => { cleanup = dispose; render(() => <TelegramIdentityProbePage tab={tab} navigate={navigate}
      getUrl={() => new URL(`${TELEGRAM_PROBE_ORIGIN}${TELEGRAM_PROBE_PATH}`)} createClient={makeClient} />, container); });
    try {
      await vi.waitFor(() => expect(container.querySelector("button")).not.toBeNull());
      container.querySelector<HTMLButtonElement>("button")?.click();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("https://oauth.telegram.org/auth"));
      expect(container.textContent).not.toContain("Connect account");
      expect(values.size).toBe(1);
      const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true });
      window.dispatchEvent(restored);
      await vi.waitFor(() => expect(container.textContent).toContain("Previous login cancelled."));
      expect(values.size).toBe(0); expect(container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
    } finally { cleanup(); container.remove(); }
  });
});
