import { describe, expect, it, vi } from "vitest";
import { createRewardFundingController } from "./reward-funding-controller.ts";
import type { RewardFundingActor, RewardFundingApi, RewardFundingTarget } from "./reward-funding-client.ts";
import type { RewardFundingReceipt, RewardFundingRecovery } from "./reward-funding-recovery.ts";
import { RewardFundingNotBroadcastError, type RewardWallet } from "./reward-wallet-session.ts";
import { actor, context, fee, target, transactionHash } from "../../test/fixtures/reward-funding.ts";

function harness(kind: RewardFundingTarget["kind"] = "asset_bonus") {
  let selected: RewardFundingActor | null = actor;
  let server = context(kind);
  const receipts = new Map<string, RewardFundingReceipt>();
  let queue = Promise.resolve();
  const recovery: RewardFundingRecovery = {
    read: key => receipts.get(key) ?? null,
    write: (key, value) => { receipts.set(key, { ...value }); },
    remove: key => { receipts.delete(key); },
    async exclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
      const previous = queue;
      let release = () => {};
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await operation(); } finally { release(); }
    },
  };
  const api: RewardFundingApi = {
    load: vi.fn(async () => server),
    observe: vi.fn<RewardFundingApi["observe"]>(async (_target, _actor, hash) => ({ ...server.funding, status: "confirming", transaction_hash: hash })),
  };
  const wallet: RewardWallet = {
    estimate: vi.fn(async () => fee),
    send: vi.fn(async (_context, _fee, before) => { await before(); return transactionHash; }),
    dispose: vi.fn(),
  };
  const create = () => createRewardFundingController({ target: { ...target, kind }, actor, currentActor: () => selected, api, wallet, recovery });
  return { create, controller: create(), api, wallet, recovery, receipts,
    select: (value: RewardFundingActor | null) => { selected = value; },
    server: (value: typeof server) => { server = value; },
  };
}
async function review(controller: ReturnType<typeof createRewardFundingController>) {
  const result = await controller.prepare();
  if (result.kind !== "review") throw new Error("expected review");
  return result.review;
}

describe("persona reward funding submission", () => {
  it.each(["megapot_pool", "asset_bonus"] as const)("reviews and observes %s without claiming a hash is funded", async kind => {
    const h = harness(kind);
    const r = await review(h.controller);
    expect(r.context.funding).toMatchObject({ sender_address: context().funding.sender_address, expected_amount_atomic: "1000000" });
    expect(Object.isFrozen(r.context.funding)).toBe(true);
    const result = await h.controller.confirm(r.id);
    expect(result).toMatchObject({ kind: "server", funding: { status: "confirming", transaction_hash: transactionHash } });
    expect(h.api.observe).toHaveBeenCalledWith({ ...target, kind }, actor, transactionHash, expect.any(String));
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
    h.server({ ...context(kind), funding: { ...context(kind).funding, status: "confirmed", transaction_hash: transactionHash, confirmed_amount_atomic: "1000000" } });
    expect(await h.controller.recover()).toMatchObject({ kind: "server", funding: { status: "confirmed" } });
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("requires the exact explicit review token", async () => {
    const h = harness();
    await expect(h.controller.confirm("guessed")).rejects.toThrow("funding_review_required");
    await review(h.controller);
    await expect(h.controller.confirm("guessed")).rejects.toThrow("funding_review_required");
    expect(h.wallet.send).not.toHaveBeenCalled();
  });
  it("rechecks immutable instructions before calling the wallet", async () => {
    const h = harness(); const r = await review(h.controller);
    h.server({ ...context(), funding: { ...context().funding, expected_amount_atomic: "2000000" } });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("funding_terms_changed");
    expect(h.wallet.send).not.toHaveBeenCalled();
  });
  it("rechecks instructions after the wallet preflight", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => {
      h.server({ ...context(), funding: { ...context().funding, recipient_address: context().funding.token_address } });
      await before(); throw new Error("unreachable broadcast");
    });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("funding_terms_changed");
    expect(h.receipts.size).toBe(0);
  });
  it.each(["account", "persona", "logout"])("rejects a %s change before confirmation", async change => {
    const h = harness(); const r = await review(h.controller);
    h.select(change === "logout" ? null : { ...actor, [change === "account" ? "accountId" : "personaId"]: "other" });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("funding_actor_changed");
    expect(h.wallet.send).not.toHaveBeenCalled();
    expect(h.controller.state.kind).toBe("closed");
  });
  it("rejects persona changes during preflight before marking or broadcasting", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { h.select(null); await before(); return transactionHash; });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("funding_actor_changed");
    expect(h.receipts.size).toBe(0);
  });
  it("persists an uncertain marker before the broadcast begins", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => {
      await before();
      expect([...h.receipts.values()]).toMatchObject([{ transactionHash: null }]);
      throw new Error("connection lost");
    });
    expect(await h.controller.confirm(r.id)).toEqual({ kind: "uncertain", transactionHash: null });
    const reopened = h.create();
    expect(await reopened.prepare()).toEqual({ kind: "uncertain", transactionHash: null });
    expect(await reopened.recover()).toEqual({ kind: "uncertain", transactionHash: null });
    await expect(reopened.confirm(r.id)).rejects.toThrow("funding_review_required");
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("refuses to send when durable storage fails before broadcast", async () => {
    const h = harness(); const r = await review(h.controller);
    h.recovery.write = () => { throw new Error("quota"); };
    const broadcast = vi.fn();
    h.wallet.send = async (_c, _f, before) => { await before(); broadcast(); return transactionHash; };
    await expect(h.controller.confirm(r.id)).rejects.toThrow("quota");
    expect(broadcast).not.toHaveBeenCalled();
  });
  it("retains the unknown-submission marker when saving a returned hash fails", async () => {
    const h = harness(); const r = await review(h.controller); const write = h.recovery.write;
    h.recovery.write = (key, receipt) => { if (receipt.transactionHash !== null) throw new Error("quota"); write(key, receipt); };
    expect(await h.controller.confirm(r.id)).toMatchObject({ kind: "server", funding: { transaction_hash: transactionHash }, reconciliationReason: "recovery_unavailable" });
    expect(h.api.observe).toHaveBeenCalledWith(target, actor, transactionHash, expect.any(String));
    expect(await h.create().prepare()).toEqual({ kind: "uncertain", transactionHash: null });
  });
  it("retains the guard even when a provider reports refusal after possible broadcast", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { await before(); throw Object.assign(new Error("declined"), { code: 4001 }); });
    expect(await h.controller.confirm(r.id)).toMatchObject({ kind: "reconciliation", reason: "provider_rejected", transactionHash: null });
    expect(h.receipts.size).toBe(1);
    expect(await h.create().prepare()).toEqual({ kind: "uncertain", transactionHash: null });
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
    expect(h.api.observe).not.toHaveBeenCalled();
  });
  it("replays observation with the same key after navigation without resending", async () => {
    const h = harness(); const r = await review(h.controller);
    h.api.observe = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...context().funding, status: "confirming", transaction_hash: transactionHash });
    expect(await h.controller.confirm(r.id)).toEqual({ kind: "submitted", transactionHash });
    await h.create().recover();
    const calls = vi.mocked(h.api.observe).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("serializes independent controllers for the same effect", async () => {
    const h = harness(); const second = h.create();
    const [one, two] = await Promise.all([review(h.controller), review(second)]);
    await Promise.all([h.controller.confirm(one.id), second.confirm(two.id)]);
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it.each(["confirmed", "confirming", "reverted", "reconciliation_required"] as const)("never offers another transfer for server state %s", async status => {
    const h = harness(); h.server({ ...context(), funding: { ...context().funding, status } });
    expect(await h.controller.prepare()).toMatchObject({ kind: "server", funding: { status } });
    expect(h.wallet.estimate).not.toHaveBeenCalled();
  });
  it("does not leak a late submission result after disposal", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { await before(); h.controller.dispose(); return transactionHash; });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("funding_actor_changed");
    expect(h.controller.state).toEqual({ kind: "closed" });
    expect([...h.receipts.values()][0].transactionHash).toBe(transactionHash);
    expect(h.api.observe).not.toHaveBeenCalled();
  });
  it("allows a fresh review only after the adapter proves a local pre-send abort", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { await before(); throw new RewardFundingNotBroadcastError(new Error("wallet_reauthentication_required")); });
    await expect(h.controller.confirm(r.id)).rejects.toThrow("wallet_reauthentication_required");
    expect(h.controller.state.kind).toBe("cancelled");
    expect(h.receipts.size).toBe(0);
    expect((await review(h.create())).id).not.toBe(r.id);
  });
  it.each(["confirm", "recover", "server-read"])("surfaces a different server hash during %s", async phase => {
    const h = harness(); const r = await review(h.controller);
    const otherHash = `0x${"cd".repeat(32)}`;
    h.api.observe = vi.fn().mockRejectedValue(new Error("offline"));
    if (phase !== "confirm") await h.controller.confirm(r.id);
    h.api.observe = vi.fn().mockResolvedValue({ ...context().funding, status: "confirming", transaction_hash: otherHash });
    if (phase === "server-read") h.server({ ...context(), funding: { ...context().funding, status: "confirmed", transaction_hash: otherHash } });
    const result = phase === "confirm" ? await h.controller.confirm(r.id) : await h.create().recover();
    expect(result).toEqual({ kind: "reconciliation", reason: "transaction_mismatch", transactionHash, serverTransactionHash: otherHash });
    expect([...h.receipts.values()][0].transactionHash).toBe(transactionHash);
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("continues observation after confirmation requirements drift", async () => {
    const h = harness(); const r = await review(h.controller);
    h.api.observe = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...context().funding, status: "confirming", transaction_hash: transactionHash });
    await h.controller.confirm(r.id);
    h.server({ ...context(), funding: { ...context().funding, required_confirmations: 8 } });
    expect(await h.create().recover()).toMatchObject({ kind: "server", reconciliationReason: "terms_changed", funding: { transaction_hash: transactionHash } });
    expect(vi.mocked(h.api.observe).mock.calls[0]).toEqual(vi.mocked(h.api.observe).mock.calls[1]);
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("keeps the known hash visible when drift reconciliation is offline", async () => {
    const h = harness(); const r = await review(h.controller);
    h.api.observe = vi.fn().mockRejectedValue(new Error("offline"));
    await h.controller.confirm(r.id);
    h.server({ ...context(), funding: { ...context().funding, required_confirmations: 8 } });
    expect(await h.create().recover()).toEqual({ kind: "reconciliation", reason: "terms_changed", transactionHash });
  });
  it.each(["prepare", "confirm", "recover"])("handles corrupt recovery during %s without authorizing resend", async operation => {
    const h = harness(); const r = await review(h.controller);
    h.recovery.read = () => { throw new Error("funding_recovery_corrupt"); };
    const result = operation === "confirm" ? await h.controller.confirm(r.id) : await h.controller[operation === "prepare" ? "prepare" : "recover"]();
    expect(result).toEqual({ kind: "reconciliation", reason: "recovery_corrupt", transactionHash: null });
    expect(h.wallet.send).not.toHaveBeenCalled();
  });
  it("supports server reconciliation of corrupt evidence without deleting it", async () => {
    const h = harness();
    h.recovery.read = () => { throw new Error("funding_recovery_corrupt"); };
    h.recovery.remove = vi.fn(); h.recovery.write = vi.fn();
    expect(await h.controller.reconcileTransaction(transactionHash)).toMatchObject({ kind: "server", reconciliationReason: "recovery_corrupt", funding: { transaction_hash: transactionHash } });
    expect(h.recovery.remove).not.toHaveBeenCalled(); expect(h.recovery.write).not.toHaveBeenCalled();
    expect(h.wallet.send).not.toHaveBeenCalled();
  });
  it("can reconcile a recovered hash after an unknown submission", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { await before(); throw new Error("lost"); });
    await h.controller.confirm(r.id);
    expect(await h.create().reconcileTransaction(transactionHash)).toMatchObject({ kind: "server", funding: { transaction_hash: transactionHash } });
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });
  it("retains an in-memory hash for retry when both persistence and observation fail", async () => {
    const h = harness(); const r = await review(h.controller); const write = h.recovery.write;
    h.recovery.write = (key, receipt) => { if (receipt.transactionHash !== null) throw new Error("quota"); write(key, receipt); };
    h.api.observe = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...context().funding, status: "confirming", transaction_hash: transactionHash });
    expect(await h.controller.confirm(r.id)).toEqual({ kind: "reconciliation", reason: "recovery_unavailable", transactionHash });
    expect(await h.controller.recover()).toMatchObject({ kind: "server", funding: { transaction_hash: transactionHash } });
    expect(vi.mocked(h.api.observe).mock.calls[0]).toEqual(vi.mocked(h.api.observe).mock.calls[1]);
    expect(h.wallet.send).toHaveBeenCalledTimes(1);
  });

  it("rejects support hash replacement and recovery without a held receipt", async () => {
    const h = harness();
    await expect(h.controller.reconcileTransaction(transactionHash)).rejects.toThrow("funding_recovery_not_required");
    const r = await review(h.controller); await h.controller.confirm(r.id);
    expect(await h.controller.reconcileTransaction(`0x${"cd".repeat(32)}`)).toMatchObject({ kind: "reconciliation", reason: "transaction_mismatch", transactionHash });
    expect(h.api.observe).toHaveBeenCalledTimes(1);
  });

  it("exposes the returned hash while observation is still pending", async () => {
    const h = harness(); const r = await review(h.controller);
    let release = () => {}; let entered = () => {};
    const observing = new Promise<void>(resolve => { entered = resolve; });
    h.api.observe = async () => {
      entered(); await new Promise<void>(resolve => { release = resolve; });
      return { ...context().funding, status: "confirming", transaction_hash: transactionHash };
    };
    const pending = h.controller.confirm(r.id); await observing;
    expect(h.controller.state).toEqual({ kind: "submitted", transactionHash });
    release(); await pending;
  });

});
