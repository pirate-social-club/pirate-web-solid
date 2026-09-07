import {
  assertFundingTarget, type RewardFunding, type RewardFundingActor, type RewardFundingApi,
  type RewardFundingContext, type RewardFundingTarget,
} from "./reward-funding-client.ts";
import { rewardFundingRecoveryKey, type RewardFundingReceipt, type RewardFundingRecovery } from "./reward-funding-recovery.ts";
import { isWalletRefusal, type RewardFeeEstimate, type RewardWallet } from "./reward-wallet-session.ts";

export interface RewardFundingReview {
  readonly id: string;
  readonly context: RewardFundingContext;
  readonly fee: RewardFeeEstimate;
}
export type RewardFundingState =
  | { readonly kind: "idle" | "closed" | "cancelled" }
  | { readonly kind: "review"; readonly review: RewardFundingReview }
  | { readonly kind: "submitted" | "uncertain"; readonly transactionHash: string | null }
  | { readonly kind: "server"; readonly funding: RewardFunding };

function snapshot(context: RewardFundingContext): RewardFundingContext {
  return Object.freeze({ ...context, actor: Object.freeze({ ...context.actor }), funding: Object.freeze({ ...context.funding }) });
}
async function instructionDigest(c: RewardFundingContext): Promise<string> {
  const f = c.funding;
  const bytes = new TextEncoder().encode(JSON.stringify([
    c.actor.accountId, c.actor.personaId, c.walletIndex, f.object, f.action, f.leg_id,
    f.funding_effect_id, f.chain_id, f.token_address, f.token_decimals, f.sender_address,
    f.recipient_address, f.expected_amount_atomic, f.required_confirmations,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Parent UI must render review.context and fee before explicitly calling confirm(review.id). */
export function createRewardFundingController(options: {
  readonly target: RewardFundingTarget;
  readonly actor: RewardFundingActor;
  readonly currentActor: () => RewardFundingActor | null;
  readonly api: RewardFundingApi;
  readonly wallet: RewardWallet;
  readonly recovery: RewardFundingRecovery;
}) {
  const actor = Object.freeze({ ...options.actor });
  const target = Object.freeze({ ...options.target });
  const { api, wallet, recovery } = options;
  const key = rewardFundingRecoveryKey(actor, target);
  let state: RewardFundingState = { kind: "idle" };
  let closed = false;
  let busy = false;
  let reviewDigest: string | undefined;
  const matchesActor = () => {
    const current = options.currentActor();
    return current?.accountId === actor.accountId && current.personaId === actor.personaId;
  };
  const close = () => {
    if (!closed) wallet.dispose();
    closed = true; reviewDigest = undefined; state = { kind: "closed" };
  };
  const assertCurrent = () => {
    if (closed || !matchesActor()) { close(); throw new Error("funding_actor_changed"); }
  };
  const publish = (next: RewardFundingState) => {
    if (closed || !matchesActor()) close();
    else state = Object.freeze(next);
    return state;
  };
  const run = async (operation: () => Promise<RewardFundingState>) => {
    assertCurrent();
    if (busy) throw new Error("funding_operation_in_progress");
    busy = true;
    try { return await operation(); }
    finally { busy = false; }
  };
  const load = async () => {
    assertCurrent();
    const context = await api.load(target, actor);
    assertCurrent();
    assertFundingTarget(target, context.funding);
    if (context.actor.accountId !== actor.accountId || context.actor.personaId !== actor.personaId) {
      throw new Error("funding_actor_changed");
    }
    return snapshot(context);
  };
  const status = (funding: RewardFunding) => publish({ kind: "server", funding });
  return {
    get state(): RewardFundingState { if (!matchesActor()) close(); return state; },
    prepare() {
      return run(async () => {
        publish({ kind: "idle" });
        reviewDigest = undefined;
        const context = await load();
        if (context.funding.status !== "planned" || context.funding.transaction_hash !== null) return status(context.funding);
        const receipt = recovery.read(key);
        if (receipt !== null) return publish({ kind: receipt.transactionHash === null ? "uncertain" : "submitted", transactionHash: receipt.transactionHash });
        const fee = await wallet.estimate(context);
        assertCurrent();
        reviewDigest = await instructionDigest(context);
        assertCurrent();
        return publish({ kind: "review", review: Object.freeze({ id: crypto.randomUUID(), context, fee: Object.freeze({ ...fee }) }) });
      });
    },
    confirm(reviewId: string) {
      return run(() => recovery.exclusive(key, async () => {
        assertCurrent();
        if (state.kind !== "review" || state.review.id !== reviewId || reviewDigest === undefined) throw new Error("funding_review_required");
        const review = state.review;
        const digest = reviewDigest;
        const existing = recovery.read(key);
        if (existing !== null) return publish({ kind: existing.transactionHash === null ? "uncertain" : "submitted", transactionHash: existing.transactionHash });
        const context = await load();
        if (context.funding.status !== "planned" || context.funding.transaction_hash !== null) return status(context.funding);
        if (await instructionDigest(context) !== digest) {
          publish({ kind: "idle" });
          throw new Error("funding_terms_changed");
        }
        assertCurrent();
        let receipt: RewardFundingReceipt = { version: 1, instructionDigest: digest, observationKey: crypto.randomUUID(), transactionHash: null };
        let started = false;
        let transactionHash: string | null = null;
        try {
          transactionHash = await wallet.send(context, review.fee, async () => {
            const fresh = await load();
            if (fresh.funding.status !== "planned" || fresh.funding.transaction_hash !== null || await instructionDigest(fresh) !== digest) {
              throw new Error("funding_terms_changed");
            }
            assertCurrent();
            recovery.write(key, receipt);
            started = true;
            publish({ kind: "uncertain", transactionHash: null });
          });
          if (!started) throw new Error("funding_submission_protocol_error");
          receipt = { ...receipt, transactionHash };
          recovery.write(key, receipt);
        } catch (error) {
          if (started && isWalletRefusal(error)) {
            recovery.remove(key);
            return publish({ kind: "cancelled" });
          }
          if (started) return publish({ kind: "uncertain", transactionHash });
          throw error;
        }
        publish({ kind: "submitted", transactionHash });
        assertCurrent();
        try {
          const observed = await api.observe(target, actor, transactionHash, receipt.observationKey);
          assertCurrent();
          if (observed.transaction_hash !== transactionHash) throw new Error("funding_transaction_mismatch");
          return status(observed);
        } catch {
          return publish({ kind: "submitted", transactionHash });
        }
      }));
    },
    recover() {
      return run(() => recovery.exclusive(key, async () => {
        const context = await load();
        const funding = context.funding;
        if (funding.status !== "planned" || funding.transaction_hash !== null) return status(funding);
        const receipt = recovery.read(key);
        if (receipt === null) return publish({ kind: "idle" });
        if (receipt.instructionDigest !== await instructionDigest(context)) throw new Error("funding_terms_changed");
        assertCurrent();
        const transactionHash = receipt.transactionHash;
        if (transactionHash === null) return publish({ kind: "uncertain", transactionHash });
        try {
          const observed = await api.observe(target, actor, transactionHash, receipt.observationKey);
          assertCurrent();
          if (observed.transaction_hash !== transactionHash) throw new Error("funding_transaction_mismatch");
          return status(observed);
        } catch { return publish({ kind: "submitted", transactionHash }); }
      }));
    },
    dispose: close,
  };
}
