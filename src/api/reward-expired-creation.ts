import { assertFundingTarget, type RewardFunding, type RewardFundingActor, type RewardFundingApi, type RewardFundingTarget } from "./reward-funding-client.ts";
import { instructionDigest } from "./reward-funding-controller.ts";
import { rewardFundingRecoveryKey, type RewardFundingRecovery } from "./reward-funding-recovery.ts";

/** Archive only a server-expired effect with no evidence of a local wallet submission.
 * The persistent fence also prevents an older tab with cached planned terms from sending. */
export function expiredRewardCreationRetirement(options: {
  actor: RewardFundingActor;
  currentActor: () => RewardFundingActor | null;
  api: RewardFundingApi;
  recovery: RewardFundingRecovery;
  onExpiredUnfunded?: () => void;
}) {
  const assertCurrent = () => {
    const current = options.currentActor();
    if (current?.accountId !== options.actor.accountId || current.personaId !== options.actor.personaId) throw new Error("funding_actor_changed");
  };
  return (target: RewardFundingTarget, archive: (funding: RewardFunding) => Promise<void>) => {
    const key = rewardFundingRecoveryKey(options.actor, target);
    return options.recovery.exclusive(key, async () => {
      assertCurrent();
      const receipt = options.recovery.read(key);
      const context = await options.api.load(target, options.actor);
      assertCurrent();
      if (context.actor.accountId !== options.actor.accountId || context.actor.personaId !== options.actor.personaId) throw new Error("funding_actor_changed");
      assertFundingTarget(target, context.funding);
      if (context.funding.status !== "expired_unfunded" || context.funding.transaction_hash !== null) return false;
      options.onExpiredUnfunded?.();
      if (receipt !== null && receipt.terminalStatus !== "expired_unfunded") return false;
      const digest = await instructionDigest(context);
      assertCurrent();
      if (receipt !== null && (receipt.instructionDigest !== digest || receipt.transactionHash !== null)) throw new Error("funding_terms_changed");
      if (receipt === null) options.recovery.write(key, {
        version: 1, instructionDigest: digest, observationKey: crypto.randomUUID(), transactionHash: null, terminalStatus: "expired_unfunded",
      });
      const saved = options.recovery.read(key);
      if (saved?.terminalStatus !== "expired_unfunded" || saved.instructionDigest !== digest || saved.transactionHash !== null) throw new Error("funding_recovery_write_failed");
      assertCurrent();
      await archive(context.funding);
      return true;
    });
  };
}
