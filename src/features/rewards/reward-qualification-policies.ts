import type { GetRewardsQualificationPoliciesResponse, PirateApiClient } from "@pirate/api-client";

export type RewardPolicyClient = Pick<PirateApiClient, "get_rewardsAvailability" | "get_rewardsQualificationPolicies">;

/** Configuration-off is an ordinary answer; enabled provider failures still reject. */
export async function readRewardQualificationPolicies(client: RewardPolicyClient, signal: AbortSignal): Promise<GetRewardsQualificationPoliciesResponse | undefined> {
  const capability = await client.get_rewardsAvailability(undefined, { signal });
  // A late capability must not start a new read after its owner loses authority.
  if (!capability.enabled || signal.aborted) return undefined;
  return client.get_rewardsQualificationPolicies(undefined, { signal });
}
