import { describe, expect, it, vi } from "vitest";
import { expiredRewardCreationRetirement } from "./reward-expired-creation.ts";
import { createRewardFundingController, instructionDigest } from "./reward-funding-controller.ts";
import { rewardFundingRecoveryKey, type RewardFundingReceipt, type RewardFundingRecovery } from "./reward-funding-recovery.ts";
import type { RewardFundingActor, RewardFundingApi, RewardFundingContext } from "./reward-funding-client.ts";
import type { RewardFeeEstimate } from "./reward-wallet-session.ts";
import { actor, context, fee, target, transactionHash } from "../../test/fixtures/reward-funding.ts";

function fixture() {
  const receipts = new Map<string, RewardFundingReceipt>();
  let tail = Promise.resolve();
  const recovery: RewardFundingRecovery = {
    read: key => receipts.get(key) ?? null,
    write: (key, receipt) => { receipts.set(key, receipt); }, remove: key => { receipts.delete(key); },
    exclusive: (_key, operation) => {
      const result = tail.then(operation); tail = result.then(() => {}, () => {}); return result;
    },
  };
  const expired = { ...context(), funding: { ...context().funding, status: "expired_unfunded" as const } };
  const api: RewardFundingApi = { load: vi.fn(async () => expired), observe: vi.fn(async () => expired.funding) };
  let current: RewardFundingActor | null = actor;
  const retire = expiredRewardCreationRetirement({ actor, currentActor: () => current, api, recovery });
  const archive = vi.fn(async () => {});
  return { receipts, recovery, api, expired, retire, archive, switchActor: () => { current = null; } };
}
describe("expired creation retirement", () => {
  it("persists the old effect's fence before archiving, and can retry a failed archive", async () => {
    const f = fixture();
    f.archive.mockImplementationOnce(async () => { throw new Error("history failed"); });
    await expect(f.retire(target, f.archive)).rejects.toThrow("history failed");
    expect(f.recovery.read(rewardFundingRecoveryKey(actor, target))).toMatchObject({ terminalStatus: "expired_unfunded", transactionHash: null });
    await expect(f.retire(target, f.archive)).resolves.toBe(true);
    expect(f.archive).toHaveBeenCalledWith(f.expired.funding);
    expect(f.receipts.size).toBe(1);
  });
  it.each([null, transactionHash])("preserves an uncertain wallet journal with hash %s", async hash => {
    const f = fixture();
    const receipt = { version: 1 as const, instructionDigest: await instructionDigest(context()), observationKey: crypto.randomUUID(), transactionHash: hash };
    f.recovery.write(rewardFundingRecoveryKey(actor, target), receipt);
    expect(await f.retire(target, f.archive)).toBe(false);
    expect(f.archive).not.toHaveBeenCalled(); expect(f.api.load).toHaveBeenCalledTimes(1);
    expect([...f.receipts.values()]).toEqual([receipt]);
    const wallet = { estimate: vi.fn(async () => fee), send: vi.fn(async () => transactionHash), dispose: vi.fn() };
    const controller = createRewardFundingController({ actor, target, currentActor: () => actor, api: f.api, recovery: f.recovery, wallet });
    expect(await controller.recover()).toMatchObject(hash === null ? { kind: "uncertain" } : { kind: "reconciliation", reason: "transaction_mismatch" });
    expect(wallet.send).not.toHaveBeenCalled();
  });
  it("prevents an older reviewed tab from signing with cached planned status", async () => {
    const f = fixture();
    const wallet = { estimate: vi.fn(async () => fee), send: vi.fn(async () => transactionHash), dispose: vi.fn() };
    const oldApi: RewardFundingApi = { load: vi.fn(async () => context()), observe: f.api.observe };
    const oldTab = createRewardFundingController({ actor, target, currentActor: () => actor, api: oldApi, recovery: f.recovery, wallet });
    const review = await oldTab.prepare(); if (review.kind !== "review") throw new Error("review missing");
    expect(await f.retire(target, f.archive)).toBe(true);
    expect(await oldTab.confirm(review.review.id)).toMatchObject({ kind: "uncertain" });
    expect(wallet.send).not.toHaveBeenCalled();
  });
  it("serializes retirement against a send already admitted to the wallet", async () => {
    const f = fixture(); let admitted = () => {}; let release = () => {};
    const entered = new Promise<void>(resolve => { admitted = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const wallet = { estimate: vi.fn(async () => fee), send: vi.fn(async (_context: RewardFundingContext, _fee: RewardFeeEstimate, before: () => Promise<void>) => { await before(); admitted(); await held; throw new Error("lost wallet response"); }), dispose: vi.fn() };
    const plannedApi: RewardFundingApi = { load: vi.fn(async () => context()), observe: f.api.observe };
    const tab = createRewardFundingController({ actor, target, currentActor: () => actor, api: plannedApi, recovery: f.recovery, wallet });
    const review = await tab.prepare(); if (review.kind !== "review") throw new Error("review missing");
    const send = tab.confirm(review.review.id); await entered;
    const retirement = f.retire(target, f.archive); release();
    expect(await send).toMatchObject({ kind: "uncertain" }); expect(await retirement).toBe(false);
    expect(f.archive).not.toHaveBeenCalled(); expect(wallet.send).toHaveBeenCalledTimes(1);
  });
  it("requires expired server status, correct identity, no bound hash, and durable storage", async () => {
    const f = fixture();
    vi.mocked(f.api.load).mockResolvedValueOnce(context()); expect(await f.retire(target, f.archive)).toBe(false);
    vi.mocked(f.api.load).mockResolvedValueOnce({ ...f.expired, funding: { ...f.expired.funding, transaction_hash: transactionHash } });
    expect(await f.retire(target, f.archive)).toBe(false);
    vi.mocked(f.api.load).mockResolvedValueOnce({ ...f.expired, funding: { ...f.expired.funding, leg_id: "another" } });
    await expect(f.retire(target, f.archive)).rejects.toThrow("funding_instruction_mismatch");
    f.recovery.write = () => {};
    await expect(f.retire(target, f.archive)).rejects.toThrow("funding_recovery_write_failed"); expect(f.archive).not.toHaveBeenCalled();
  });
  it("keeps corrupt evidence and fences actor changes during the server read", async () => {
    const f = fixture(); f.recovery.read = () => { throw new Error("funding_recovery_corrupt"); };
    await expect(f.retire(target, f.archive)).rejects.toThrow("funding_recovery_corrupt");
    f.recovery.read = () => null;
    vi.mocked(f.api.load).mockImplementationOnce(async () => { f.switchActor(); return f.expired; });
    await expect(f.retire(target, f.archive)).rejects.toThrow("funding_actor_changed"); expect(f.archive).not.toHaveBeenCalled();
  });
});
