import type { GetRewardsCreditsResponse, PostRewardsCreditsCreditIdClaimResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";

export type RewardCredit = GetRewardsCreditsResponse["items"][number];
export type RewardClaimOutcome = PostRewardsCreditsCreditIdClaimResponse["outcome"];

/**
 * Spec 015 §5.2a participant claims. Reads the signed-in account's reward
 * credits, claims one, and issues the reward-claim Very intent that the
 * /verify/very route starts when the account has no current evidence.
 */
export function createRewardClaimData(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
) {
  const write = () => {
    const token = csrf();
    if (token === undefined) throw new Error("reward_claim_csrf_required");
    return sessionRequestOptions(token);
  };
  return {
    credits() {
      return client.get_rewardsCredits({ query: { limit: "50" } });
    },
    claim(creditId: string) {
      return client.post_rewardsCreditsCreditIdClaim({ path: { creditId } }, write());
    },
    async issueVerificationIntent(): Promise<string> {
      const issued = await client.post_rewardsClaimVerificationIntents(undefined, write());
      return issued.intent_id;
    },
  };
}

export type RewardClaimData = ReturnType<typeof createRewardClaimData>;
