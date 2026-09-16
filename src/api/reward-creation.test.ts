import { describe, expect, it, vi } from "vitest";
import { createRewardCreation, rewardCreationHistoryKey, rewardCreationKey, type RewardCreationApi, type RewardCreationJournal, type RewardCreationScope, type RewardLegRequest } from "./reward-creation.ts";
const scope = { accountId: "account", personaId: "persona", communityId: "community", postId: "song" };
const offer = { path: { communityId: "community", postId: "song" }, body: { persona_id: "persona", idempotency_key: "open-key", starts_at: "2026-09-08T00:00:00Z", ends_at: "2026-09-15T00:00:00Z" } };
const leg: RewardLegRequest = { kind: "asset_bonus", input: { path: { offerId: "" }, body: {
  persona_id: "persona", idempotency_key: "leg-key", expected_qualification_policy_versions: { study: "study-v2", karaoke: "karaoke-v2" },
  chain_id: 84532, token_address: `0x${"a".repeat(40)}`, token_decimals: 6, token_symbol: "PSTB", asset_policy_version: "test-v1",
  funding_amount_atomic: "10000000", amount_per_claim_atomic: "1000000", max_claims: 10,
} } };
const target = { kind: "asset_bonus" as const, legId: "leg", fundingEffectId: "effect" };
const existingLeg: RewardLegRequest = { ...leg, input: { ...leg.input, path: { offerId: "existing-offer" } } };
function setup(options: { rediscoverOffer?: () => Promise<string | null> } = {}) {
  const values = new Map<string,string>();
  let tail = Promise.resolve();
  const journal: RewardCreationJournal = {
    read: key => values.get(key) ?? null,
    write: (key,value) => { values.set(key,value); },
    remove: key => { values.delete(key); },
    exclusive: (_key, operation) => {
      const result = tail.then(operation); tail = result.then(() => {}, () => {}); return result;
    },
  };
  const api = {
    open: vi.fn(async (_input: Parameters<RewardCreationApi["open"]>[0]) => "offer"),
    add: vi.fn(async (_request: RewardLegRequest) => target),
  };
  let current: RewardCreationScope | null = scope;
  const controller = () => createRewardCreation({
    scope, journal, api, currentScope: () => current,
    ...(options.rediscoverOffer === undefined ? {} : { rediscoverOffer: options.rediscoverOffer }),
  });
  return { values, journal, api, controller, switchActor: () => { current = null; } };
}
describe("reward creation recovery", () => {
  it("persists exact reviewed terms before either request and identities before returning", async () => {
    const s = setup();
    s.api.open.mockImplementation(async () => {
      expect(s.controller().pending()?.offer).toEqual(offer);
      expect(s.controller().pending()?.leg).toEqual(leg);
      return "offer";
    });
    s.api.add.mockImplementation(async () => {
      expect(s.controller().pending()?.offerId).toBe("offer"); return target;
    });
    expect(await s.controller().start(offer,leg)).toEqual(target);
    expect(s.controller().pending()?.target).toEqual(target);
  });
  it("replays a lost offer response with the original key after reload", async () => {
    const s = setup(); s.api.open.mockRejectedValueOnce(new Error("lost response"));
    await expect(s.controller().start(offer,leg)).rejects.toThrow("lost response");
    expect(await s.controller().recover()).toEqual(target);
    expect(s.api.open.mock.calls[0]).toEqual(s.api.open.mock.calls[1]);
    expect(s.api.add).toHaveBeenCalledTimes(1);
  });
  it("replays a lost leg response without reopening or regenerating keys", async () => {
    const s = setup(); s.api.add.mockRejectedValueOnce(new Error("lost response"));
    await expect(s.controller().start(offer,leg)).rejects.toThrow("lost response");
    expect(await s.controller().recover()).toEqual(target);
    expect(s.api.open).toHaveBeenCalledTimes(1);
    expect(s.api.add.mock.calls[0]).toEqual(s.api.add.mock.calls[1]);
  });
  it("joins an existing offer without opening one, before and after reload", async () => {
    const s = setup(); s.api.add.mockRejectedValueOnce(new Error("lost response"));
    await expect(s.controller().start(null,existingLeg)).rejects.toThrow("lost response");
    expect(s.api.open).not.toHaveBeenCalled();
    expect(s.controller().pending()?.offer).toBeNull();
    expect(s.controller().pending()?.offerId).toBe("existing-offer");
    expect(await s.controller().recover()).toEqual(target);
    expect(s.api.open).not.toHaveBeenCalled();
    expect(s.api.add.mock.calls[0]).toEqual(s.api.add.mock.calls[1]);
  });
  it("adopts a rediscovered server offer after a typed duplicate-open conflict", async () => {
    const s = setup({ rediscoverOffer: async () => "discovered-offer" });
    s.api.open.mockRejectedValueOnce(new Error("reward_creation_offer_conflict"));
    await expect(s.controller().start(offer,leg)).resolves.toEqual(target);
    expect(s.api.open).toHaveBeenCalledTimes(1);
    expect(s.api.add.mock.calls[0]?.[0].input.path.offerId).toBe("discovered-offer");
    expect(s.controller().pending()?.offerId).toBe("discovered-offer");
  });
  it("keeps the guard on an unclassified open failure", async () => {
    const s = setup();
    s.api.open.mockRejectedValueOnce(new Error("reward_creation_response_mismatch"));
    await expect(s.controller().start(offer,leg)).rejects.toThrow("reward_creation_response_mismatch");
    expect(s.api.add).not.toHaveBeenCalled();
  });
  it("keeps the guard when a duplicate-open conflict has no visible offer", async () => {
    const s = setup({ rediscoverOffer: async () => null });
    s.api.open.mockRejectedValueOnce(new Error("reward_creation_offer_conflict"));
    await expect(s.controller().start(offer,leg)).rejects.toThrow("reward_creation_offer_conflict");
    expect(s.api.add).not.toHaveBeenCalled();
    s.api.open.mockResolvedValueOnce("offer");
    await expect(s.controller().recover()).resolves.toEqual(target);
    expect(s.api.open).toHaveBeenCalledTimes(2);
    expect(s.api.add).toHaveBeenCalledTimes(1);
  });
  it("fails closed when a stored record names neither a reviewed offer nor an existing one", async () => {
    const s = setup();
    s.values.set(rewardCreationKey(scope), JSON.stringify({ version: 1, scope, offer: null, leg, offerId: null, target: null }));
    await expect(s.controller().recover()).rejects.toThrow("reward_creation_recovery_corrupt");
    expect(s.api.open).not.toHaveBeenCalled();
    expect(s.api.add).not.toHaveBeenCalled();
  });
  it("serializes two tabs on the song, refusing replacement of the pending operation", async () => {
    const s = setup();
    const results = await Promise.allSettled([s.controller().start(offer,leg),s.controller().start(offer,leg)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(s.api.open).toHaveBeenCalledTimes(1); expect(s.api.add).toHaveBeenCalledTimes(1);
  });
  it("cannot create when initial persistence fails", async () => {
    const s = setup(); s.journal.write = () => { throw new Error("storage unavailable"); };
    await expect(s.controller().start(offer,leg)).rejects.toThrow("storage unavailable");
    expect(s.api.open).not.toHaveBeenCalled(); expect(s.api.add).not.toHaveBeenCalled();
  });
  it("does not return a signing target when saving its identities fails", async () => {
    const s = setup(), write = s.journal.write;
    s.journal.write = (key,raw) => { if (JSON.parse(raw).target) throw new Error("storage unavailable"); write(key,raw); };
    await expect(s.controller().start(offer,leg)).rejects.toThrow("storage unavailable");
    s.journal.write = write;
    expect(await s.controller().recover()).toEqual(target);
    expect(s.api.add.mock.calls[0]).toEqual(s.api.add.mock.calls[1]);
  });
  it("fails closed on corrupt receipts instead of starting a replacement", async () => {
    const s = setup(); s.values.set(rewardCreationKey(scope), "{");
    await expect(s.controller().start(offer,leg)).rejects.toThrow("reward_creation_recovery_corrupt");
    expect(s.api.open).not.toHaveBeenCalled();
  });
  it("does not advance creation when the persona changes during the request", async () => {
    const s = setup(); s.api.open.mockImplementation(async () => { s.switchActor(); return "offer"; });
    await expect(s.controller().start(offer,leg)).rejects.toThrow("reward_creation_actor_changed");
    expect(s.api.add).not.toHaveBeenCalled();
  });
  it("captures terms before awaiting the lock and refuses fresh terms on recovery", async () => {
    const s = setup(), input = structuredClone(offer);
    const promise = s.controller().start(input,leg); input.body.ends_at = "2027-01-01T00:00:00Z";
    await promise; expect(s.controller().pending()?.offer).toEqual(offer);
    await expect(s.controller().start(input,leg)).rejects.toThrow("reward_creation_recovery_required");
  });
  it("archives an exact terminal funding result before allowing another reward", async () => {
    const s = setup();
    await s.controller().start(offer, leg);
    await s.controller().complete({
      object: "asset_bonus_funding", action: "fund_with_asset", funding_effect_id: "effect",
      leg_id: "leg", status: "confirmed", chain_id: 84532,
      token_address: `0x${"a".repeat(40)}`, token_decimals: 6,
      sender_address: `0x${"b".repeat(40)}`, recipient_address: `0x${"c".repeat(40)}`,
      expected_amount_atomic: "10000000", confirmed_amount_atomic: "10000000",
      required_confirmations: 2, transaction_hash: `0x${"d".repeat(64)}`,
    });
    expect(s.controller().pending()).toBeNull();
    expect(s.values.has(rewardCreationHistoryKey(scope, target))).toBe(true);
    await expect(s.controller().start(offer, leg)).resolves.toEqual(target);
  });
  it("keeps the active guard when funding is not terminal or does not match", async () => {
    const s = setup();
    await s.controller().start(offer, leg);
    const planned = {
      object: "asset_bonus_funding" as const, action: "fund_with_asset" as const,
      funding_effect_id: "effect", leg_id: "leg", status: "planned" as const,
      chain_id: 84532 as const, token_address: `0x${"a".repeat(40)}`,
      token_decimals: 6, sender_address: `0x${"b".repeat(40)}`,
      recipient_address: `0x${"c".repeat(40)}`, expected_amount_atomic: "10000000",
      confirmed_amount_atomic: null, required_confirmations: 2, transaction_hash: null,
    };
    await expect(s.controller().complete(planned)).rejects.toThrow("reward_creation_completion_unproven");
    await expect(s.controller().complete({ ...planned, status: "confirmed", leg_id: "other" })).rejects.toThrow("reward_creation_completion_unproven");
    expect(s.controller().pending()?.target).toEqual(target);
  });
});
