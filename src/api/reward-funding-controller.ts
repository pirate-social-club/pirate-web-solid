import {
  assertFundingTarget, type RewardFunding, type RewardFundingActor, type RewardFundingApi,
  type RewardFundingContext, type RewardFundingTarget,
} from "./reward-funding-client.ts";
import { rewardFundingRecoveryKey, type RewardFundingReceipt, type RewardFundingRecovery } from "./reward-funding-recovery.ts";
import { isWalletRefusal, RewardFundingNotBroadcastError, type RewardFeeEstimate, type RewardWallet } from "./reward-wallet-session.ts";

export interface RewardFundingReview {
  readonly id: string;
  readonly context: RewardFundingContext;
  readonly fee: RewardFeeEstimate;
}
export type RewardFundingReconciliationReason =
  | "transaction_mismatch" | "terms_changed" | "recovery_corrupt" | "recovery_unavailable" | "provider_rejected";
export type RewardFundingState =
  | { readonly kind: "idle" | "closed" | "cancelled" }
  | { readonly kind: "review"; readonly review: RewardFundingReview }
  | { readonly kind: "submitted" | "uncertain"; readonly transactionHash: string | null }
  | { readonly kind: "reconciliation"; readonly reason: RewardFundingReconciliationReason;
      readonly transactionHash: string | null; readonly serverTransactionHash?: string | null }
  | { readonly kind: "server"; readonly funding: RewardFunding; readonly reconciliationReason?: RewardFundingReconciliationReason };

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
  // Retain a returned hash for same-session retries even if its durable write fails.
  let volatileReceipt: RewardFundingReceipt | null = null;
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
  const reconcile = (reason: RewardFundingReconciliationReason, transactionHash: string | null, serverTransactionHash?: string | null) =>
    publish({ kind: "reconciliation", reason, transactionHash, ...(serverTransactionHash === undefined ? {} : { serverTransactionHash }) });
  const status = (funding: RewardFunding, reason?: RewardFundingReconciliationReason) =>
    publish({ kind: "server", funding, ...(reason === undefined ? {} : { reconciliationReason: reason }) });
  const read = () => {
    try { return { receipt: volatileReceipt ?? recovery.read(key), problem: undefined }; }
    catch (error) {
      const problem: RewardFundingReconciliationReason = error instanceof Error && error.message === "funding_recovery_corrupt"
        ? "recovery_corrupt" : "recovery_unavailable";
      return { receipt: null, problem };
    }
  };
  const held = (receipt: RewardFundingReceipt) => publish({
    kind: receipt.transactionHash === null ? "uncertain" : "submitted", transactionHash: receipt.transactionHash,
  });
  const serverResult = (funding: RewardFunding, receipt: RewardFundingReceipt | null, problem?: RewardFundingReconciliationReason) => {
    if (receipt?.transactionHash && funding.transaction_hash !== receipt.transactionHash) {
      return reconcile("transaction_mismatch", receipt.transactionHash, funding.transaction_hash);
    }
    return status(funding, problem);
  };
  const observe = async (receipt: RewardFundingReceipt, problem?: RewardFundingReconciliationReason) => {
    const hash = receipt.transactionHash;
    if (hash === null) return problem === undefined ? held(receipt) : reconcile(problem, null);
    assertCurrent();
    if (problem === undefined) publish({ kind: "submitted", transactionHash: hash });
    else reconcile(problem, hash);
    let observed: RewardFunding;
    try { observed = await api.observe(target, actor, hash, receipt.observationKey); }
    catch {
      return problem === undefined ? publish({ kind: "submitted", transactionHash: hash }) : reconcile(problem, hash);
    }
    assertCurrent();
    // Integrity failures are outside the transport catch and cannot become a retry blip.
    return serverResult(observed, receipt, problem);
  };
  return {
    get state(): RewardFundingState { if (!matchesActor()) close(); return state; },
    prepare() {
      return run(async () => {
        publish({ kind: "idle" });
        reviewDigest = undefined;
        const context = await load();
        const { receipt, problem } = read();
        if (context.funding.status !== "planned" || context.funding.transaction_hash !== null) return serverResult(context.funding, receipt, problem);
        if (problem !== undefined) return reconcile(problem, null);
        if (receipt !== null) return held(receipt);
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
        const { receipt: existing, problem } = read();
        if (problem !== undefined) return reconcile(problem, null);
        if (existing !== null) return held(existing);
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
          volatileReceipt = receipt;
        } catch (error) {
          if (started && error instanceof RewardFundingNotBroadcastError) {
            try { recovery.remove(key); }
            catch { return reconcile("recovery_unavailable", null); }
            publish({ kind: "cancelled" });
            throw error;
          }
          if (started && isWalletRefusal(error)) return reconcile("provider_rejected", null);
          if (started) return publish({ kind: "uncertain", transactionHash });
          throw error;
        }
        let persistenceProblem: RewardFundingReconciliationReason | undefined;
        try { recovery.write(key, receipt); }
        catch { persistenceProblem = "recovery_unavailable"; }
        // A failed hash write must not prevent handing the hash to the server.
        return observe(receipt, persistenceProblem);
      }));
    },
    recover() {
      return run(() => recovery.exclusive(key, async () => {
        const context = await load();
        const funding = context.funding;
        const { receipt, problem } = read();
        const drift = receipt !== null && receipt.instructionDigest !== await instructionDigest(context);
        assertCurrent();
        if (funding.status !== "planned" || funding.transaction_hash !== null) return serverResult(funding, receipt, problem ?? (drift ? "terms_changed" : undefined));
        if (problem !== undefined) return reconcile(problem, null);
        if (receipt === null) return publish({ kind: "idle" });
        return observe(receipt, drift ? "terms_changed" : undefined);
      }));
    },
    /** Support-assisted hash recovery only; never clears a guard or authorizes a transfer. */
    reconcileTransaction(transactionHash: string) {
      return run(() => recovery.exclusive(key, async () => {
        if (!/^0x[0-9a-f]{64}$/iu.test(transactionHash)) throw new Error("funding_invalid_transaction_hash");
        const hash = transactionHash.toLowerCase();
        const context = await load();
        const { receipt, problem } = read();
        if (receipt === null && problem === undefined) throw new Error("funding_recovery_not_required");
        if (receipt?.transactionHash && receipt.transactionHash !== hash) return reconcile("transaction_mismatch", receipt.transactionHash, hash);
        const recovered: RewardFundingReceipt = {
          version: 1, instructionDigest: receipt?.instructionDigest ?? await instructionDigest(context),
          observationKey: receipt?.observationKey ?? crypto.randomUUID(), transactionHash: hash,
        };
        if (context.funding.status !== "planned" || context.funding.transaction_hash !== null) return serverResult(context.funding, recovered, problem);
        // Keep damaged journal evidence intact. A server observation can settle the effect.
        let observationProblem: RewardFundingReconciliationReason | undefined = problem;
        if (receipt !== null) {
          volatileReceipt = recovered;
          try { recovery.write(key, recovered); }
          catch { observationProblem = "recovery_unavailable"; }
          if (observationProblem === undefined && recovered.instructionDigest !== await instructionDigest(context)) observationProblem = "terms_changed";
        }
        return observe(recovered, observationProblem);
      }));
    },
    dispose: close,
  };
}
