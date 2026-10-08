import type { GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse, GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse } from "@pirate/api-client";
import { formatUnits } from "viem";
import { createPublicApiClient } from "../../../api/client.ts";
import { qualificationText } from "../../rewards/reward-sponsor-terms.ts";
import { POOL_HOLD_NOTICE_COPY } from "../../rewards/pool-hold-notice.tsx";

export interface SongActivityRewards {
  readonly pool: GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"];
  readonly bonuses: GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse;
}
export interface ActivityReward {
  readonly id: string;
  readonly kind: "bonus" | "lottery";
  readonly activity: "study" | "karaoke";
  readonly label: string;
  readonly shortLabel: string;
  readonly terms: readonly string[];
}

/** Public projections only: browsing activities never reads credits or standing. */
export async function readSongActivityRewards(communityId: string, postId: string): Promise<SongActivityRewards> {
  const client = createPublicApiClient();
  const path = { communityId, postId };
  const [pool, bonuses] = await Promise.all([
    client.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool({ path }),
    client.get_communitiesCommunityIdPostsPostIdRewardsAssetBonuses({ path }),
  ]);
  return { pool: pool.pool, bonuses };
}

/** Advertise only funded, open rewards with known qualification requirements. */
export function songActivityRewards(data: SongActivityRewards, now = Date.now()): readonly ActivityReward[] {
  const rewards: ActivityReward[] = [];
  for (const bonus of data.bonuses.items) {
    if (bonus.offer_status !== "active" || bonus.leg_status !== "active" || bonus.claimed_count >= bonus.max_claims) continue;
    const amount = BigInt(bonus.amount_per_claim_atomic);
    if (amount <= 0n || BigInt(bonus.available_inventory_atomic) < amount) continue;
    for (const policy of bonus.qualification_policies ?? []) {
      rewards.push({ id: bonus.leg_id, kind: "bonus", activity: policy.activity,
        label: `${formatUnits(amount, bonus.token_decimals)} ${bonus.token_symbol} bonus`,
        shortLabel: `${formatUnits(amount, bonus.token_decimals)} ${bonus.token_symbol}`,
        terms: [qualificationText(policy), `${bonus.max_claims - bonus.claimed_count} claims remaining. One per qualifying account; shared across activities.`],
      });
    }
  }
  const pool = data.pool;
  if (pool?.offer_status === "active" && pool.leg_status === "active" && BigInt(pool.available_budget_atomic) > 0n
    && (pool.drawing === null || (pool.drawing.lifecycle_status === "entry_open" && Date.parse(pool.drawing.entry_cutoff_at) > now))) {
    for (const policy of pool.qualification_policies ?? []) {
      if (!pool.eligible_activities.includes(policy.activity)) continue;
      rewards.push({ id: pool.leg_id, kind: "lottery", activity: policy.activity, label: lotteryLabel(pool), shortLabel: lotteryLabel(pool),
        terms: ["Qualify for a chance to share the winnings.", ...(pool.drawing?.gross_prize_pool_atomic && pool.drawing.prize_pool_observed_at ? [`Drawing-wide gross prize pool, observed ${new Date(pool.drawing.prize_pool_observed_at).toLocaleString()}. This is not your individual payout.`] : []), qualificationText(policy), `Additional score floor: ${pool.min_score_bps / 100}%.`,
          `${formatUnits(BigInt(pool.available_budget_atomic), pool.token_decimals)} USDC pool budget. This funds tickets, not a guaranteed payout. Qualifiers share any net winnings equally.`,
          ...(pool.drawing ? [`Entries close ${new Date(pool.drawing.entry_cutoff_at).toLocaleString()}.`] : []),
          "Pirate holds the ticket.", POOL_HOLD_NOTICE_COPY, ...(pool.fallback_disclosure ? [pool.fallback_disclosure] : [])],
      });
    }
  }
  return rewards;
}

/** Round down, so a compact label never inflates the observed USDC jackpot. */
function lotteryLabel(pool: NonNullable<SongActivityRewards["pool"]>): string {
  const drawing = pool.drawing;
  if (!drawing?.gross_prize_pool_atomic || !drawing.prize_pool_observed_at
    || !Number.isFinite(Date.parse(drawing.prize_pool_observed_at))) return "Lottery";
  const atomic = BigInt(drawing.gross_prize_pool_atomic);
  if (atomic <= 0n) return "Lottery";
  const dollars = atomic / (10n ** BigInt(pool.token_decimals));
  for (const [divisor, suffix] of [[1_000_000_000n, "B"], [1_000_000n, "M"], [1_000n, "K"]] as const) {
    if (dollars >= divisor) {
      const tenths = dollars * 10n / divisor;
      return `$${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ""}${suffix} lottery`;
    }
  }
  return `$${dollars.toLocaleString("en-US")} lottery`;
}
