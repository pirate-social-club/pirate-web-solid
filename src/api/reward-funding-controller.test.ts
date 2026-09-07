import { describe, expect, it, vi } from "vitest";
import { createRewardFundingController } from "./reward-funding-controller.ts";
import type { RewardFundingActor, RewardFundingApi, RewardFundingTarget } from "./reward-funding-client.ts";
import type { RewardFundingReceipt, RewardFundingRecovery } from "./reward-funding-recovery.ts";
import type { RewardWallet } from "./reward-wallet-session.ts";
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
    expect(await h.controller.confirm(r.id)).toEqual({ kind: "uncertain", transactionHash });
    expect(await h.create().prepare()).toEqual({ kind: "uncertain", transactionHash: null });
  });
  it("allows a new explicit review after definite wallet refusal", async () => {
    const h = harness(); const r = await review(h.controller);
    h.wallet.send = vi.fn(async (_c, _f, before) => { await before(); throw Object.assign(new Error("declined"), { code: 4001 }); });
    expect(await h.controller.confirm(r.id)).toEqual({ kind: "cancelled" });
    expect(h.receipts.size).toBe(0);
    expect((await review(h.controller)).id).not.toBe(r.id);
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
});
