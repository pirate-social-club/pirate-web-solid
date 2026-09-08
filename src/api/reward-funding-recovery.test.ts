import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserRewardFundingRecovery, rewardFundingRecoveryKey, type RewardFundingReceipt } from "./reward-funding-recovery.ts";
import { actor, target, transactionHash } from "../../test/fixtures/reward-funding.ts";
afterEach(() => vi.unstubAllGlobals());
function browser() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }), removeItem: vi.fn((key: string) => { data.delete(key); }) };
  const request = vi.fn(async <T>(_name: string, _options: object, callback: () => Promise<T>) => callback());
  vi.stubGlobal("window", { localStorage: storage }); vi.stubGlobal("navigator", { locks: { request } });
  return { data, storage, request };
}
const receipt: RewardFundingReceipt = { version: 1, instructionDigest: "a".repeat(64), observationKey: "12345678-1234-4234-8234-123456789012", transactionHash };
describe("durable funding recovery", () => {
  it("roundtrips identifiers across instances and acquires the effect lock", async () => {
    const b = browser(); const key = rewardFundingRecoveryKey(actor, target);
    createBrowserRewardFundingRecovery().write(key, receipt);
    const reopened = createBrowserRewardFundingRecovery();
    expect(reopened.read(key)).toEqual(receipt);
    expect(await reopened.exclusive(key, async () => "locked")).toBe("locked");
    expect(b.request).toHaveBeenCalledWith(key, { mode: "exclusive" }, expect.any(Function));
    reopened.remove(key); expect(reopened.read(key)).toBeNull();
    expect([...b.data.values()].join("")).not.toContain("token");
  });
  it("isolates account and persona recovery keys", () => {
    const key = rewardFundingRecoveryKey(actor, target);
    expect(key).not.toBe(rewardFundingRecoveryKey({ ...actor, accountId: "other" }, target));
    expect(key).not.toBe(rewardFundingRecoveryKey({ ...actor, personaId: "other" }, target));
  });
  it.each(["{}", '{"version":', "null"])("fails closed on corrupt recovery %s", raw => {
    const b = browser(); b.data.set("key", raw);
    expect(() => createBrowserRewardFundingRecovery().read("key")).toThrow("funding_recovery_corrupt");
  });
  it("detects a non-durable write", () => {
    const b = browser(); b.storage.setItem.mockImplementation(() => {});
    expect(() => createBrowserRewardFundingRecovery().write("key", receipt)).toThrow("funding_recovery_write_failed");
  });
  it("requires cross-tab locks", () => {
    browser(); vi.stubGlobal("navigator", {});
    expect(() => createBrowserRewardFundingRecovery()).toThrow("funding_durable_recovery_unavailable");
  });
  it("has an explicit SSR boundary", () => {
    vi.stubGlobal("window", undefined);
    expect(() => createBrowserRewardFundingRecovery()).toThrow("funding_durable_recovery_unavailable");
  });
});
