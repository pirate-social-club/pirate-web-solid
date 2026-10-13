import { describe, expect, it, vi } from "vitest";
import { createProbeController, takeProbeCallback, validProbeAuthorizationUrl, type ProbeClient, type ProbeView } from "./telegram-identity-probe-controller.ts";
import { TELEGRAM_PROBE_ORIGIN, TELEGRAM_PROBE_CALLBACK_PATH } from "./telegram-identity-probe-config.ts";

function fixture() {
  let now = Date.parse("2026-10-10T15:30:00Z");
  const values = new Map<string, string>();
  const tab = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const views: ProbeView[] = [];
  const client = { start: vi.fn().mockResolvedValue({ url: "https://oauth.telegram.org/auth", state: "expected-state", verifier: "temporary-verifier" }),
    finish: vi.fn().mockResolvedValue("a".repeat(64)), clear: vi.fn() } satisfies ProbeClient;
  const navigate = vi.fn(), createClient = vi.fn().mockResolvedValue(client);
  const build = (origin = TELEGRAM_PROBE_ORIGIN) => createProbeController({ tab, origin, navigate, createClient, now: () => now, view: value => views.push(value) });
  const callback = (state = "expected-state") => new URL(`${TELEGRAM_PROBE_ORIGIN}${TELEGRAM_PROBE_CALLBACK_PATH}?privy_oauth_code=one-time-code&privy_oauth_state=${state}&privy_oauth_provider=telegram`);
  return { build, values, tab, views, client, navigate, createClient, callback, advance: (ms: number) => { now += ms; } };
}

describe("same-tab Telegram continuation", () => {
  it("survives full-page disposal with only temporary PKCE state and consumes the return once", async () => {
    const f = fixture(), original = f.build(); await original.start();
    expect(f.navigate).toHaveBeenCalledWith("https://oauth.telegram.org/auth");
    expect(f.values.size).toBe(1);
    const snapshot = JSON.parse([...f.values.values()][0] ?? "null");
    expect(Object.keys(snapshot).sort()).toEqual(["appId", "startedAt", "state", "verifier", "version"]);
    original.dispose(); expect(f.values.size).toBe(1);
    const returned = f.build(); await returned.resume(f.callback());
    expect(f.client.finish).toHaveBeenCalledWith({ code: "one-time-code", state: "expected-state" }, "temporary-verifier", expect.any(AbortSignal));
    expect(f.values.size).toBe(0); expect(f.views.at(-1)).toMatchObject({ phase: "done" });
    await f.build().resume(f.callback()); expect(f.client.finish).toHaveBeenCalledOnce();
  });
  it.each(["wrong-state", "", "expected-state&privy_oauth_state=expected-state"])("refuses mismatched or ambiguous return state %s", async state => {
    const f = fixture(); await f.build().start(); await f.build().resume(f.callback(state));
    expect(f.client.finish).not.toHaveBeenCalled(); expect(f.values.size).toBe(0);
  });
  it("refuses expiry before creating a returning SDK client", async () => {
    const f = fixture(); await f.build().start(); f.advance(300_000); await f.build().resume(f.callback());
    expect(f.createClient).toHaveBeenCalledOnce(); expect(f.client.finish).not.toHaveBeenCalled(); expect(f.values.size).toBe(0);
  });
  it("fails when a return opens in a new tab with no saved state", async () => {
    const f = fixture(); await f.build().resume(f.callback());
    expect(f.createClient).not.toHaveBeenCalled(); expect(f.views.at(-1)).toMatchObject({ phase: "error" });
  });
  it("ignores late initialization and erases state on cancellation", async () => {
    const f = fixture(); let resolve: ((value: ProbeClient) => void) | undefined;
    f.createClient.mockImplementation(() => new Promise<ProbeClient>(yes => { resolve = yes; }));
    const controller = f.build(), pending = controller.start(); controller.cancel(); resolve?.(f.client); await pending;
    expect(f.client.start).not.toHaveBeenCalled(); expect(f.client.clear).toHaveBeenCalled(); expect(f.navigate).not.toHaveBeenCalled();
  });
  it("does not report completion after cancellation during exchange", async () => {
    const f = fixture(); await f.build().start(); let resolve: ((value: string) => void) | undefined;
    f.client.finish.mockImplementation(() => new Promise<string>(yes => { resolve = yes; }));
    const controller = f.build(), pending = controller.resume(f.callback());
    await vi.waitFor(() => expect(f.client.finish).toHaveBeenCalledOnce()); controller.cancel(); resolve?.("a".repeat(64)); await pending;
    expect(f.views.at(-1)).toMatchObject({ phase: "error" }); expect(f.values.size).toBe(0);
  });
  it("does not contact Privy from a production or community browser origin", async () => {
    for (const origin of ["https://pirate.sc", "https://app.community.hns"]) {
      const f = fixture(); await f.build(origin).start(); expect(f.createClient).not.toHaveBeenCalled();
    }
  });
  it("refuses unavailable storage before navigating", async () => {
    const f = fixture(); f.tab.setItem = () => { throw new Error("blocked"); };
    await f.build().start(); expect(f.navigate).not.toHaveBeenCalled(); expect(f.values.size).toBe(0);
  });
  it("rejects injected token entries and consumes them", async () => {
    const f = fixture(); await f.build().start();
    const key = [...f.values.keys()][0]; if (key === undefined) throw new Error("fixture missing state");
    f.values.set(key, JSON.stringify({ ...JSON.parse(f.values.get(key) ?? "null"), token: "do-not-restore" }));
    await f.build().resume(f.callback()); expect(f.client.finish).not.toHaveBeenCalled(); expect(f.values.size).toBe(0);
  });
  it("rejects unsupported return and authorization origins", () => {
    const f = fixture(), foreign = f.callback(); foreign.hostname = "attacker.example";
    expect(takeProbeCallback(foreign)).toBeUndefined();
    expect(validProbeAuthorizationUrl("https://attacker.example/auth")).toBe(false);
    expect(validProbeAuthorizationUrl("https://auth.privy.io/auth")).toBe(true);
  });
});
