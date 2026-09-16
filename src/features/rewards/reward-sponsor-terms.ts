import type { OpenSongRewardOfferInput } from "@pirate/api-client";
import type { RewardCreationScope, RewardLegRequest } from "../../api/reward-creation.ts";
import type { RewardAsset, RewardPolicy, RewardSponsorContext } from "../../api/reward-sponsor-data.ts";
export interface SponsorDraft {
  kind: "megapot_pool" | "asset_bonus";
  amount: string;
  perClaim: string;
  claims: string;
  assetAddress: string;
  activities: "either" | "study" | "karaoke";
  minimumScore: string;
  ticketCeiling: string;
  cutoffSeconds: string;
  endsAt: string;
}
export function rewardAtomic(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77 || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) throw new Error("Enter a positive amount without commas.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("Enter an amount within the token's range.");
  return amount.toString();
}
export function qualificationText(row: RewardPolicy): string {
  const p = row.policy;
  if (p.kind === "study_session_first_pass_v2") return `Study: ${p.required_correct_bps / 100}% correct on the first pass.`;
  return `Singing: ${p.minimum_final_score_bps / 100}% score, ${p.minimum_coverage_bps / 100}% coverage and at least ${p.minimum_scored_line_count} scored lines.${p.kind === "karaoke_qualification_v2" ? ` Eligible tracks: ${p.eligible_playback_kinds.map(k => k === "full_mix" ? "full mix" : "instrumental").join(" or ")}.` : ""}`;
}
export function sponsorTerms(
  scope: RewardCreationScope,
  draft: SponsorDraft,
  assets: readonly RewardAsset[],
  policies: readonly RewardPolicy[],
  now: Date,
  existingOffer: RewardSponsorContext["offer"] = null,
) {
  const existingOfferId = existingOffer?.offer_id ?? null;
  let offer: OpenSongRewardOfferInput | null = null;
  if (existingOfferId === null) {
    const ends = new Date(draft.endsAt);
    if (!Number.isFinite(ends.getTime()) || ends <= now) throw new Error("Choose an end time in the future.");
    offer = { path: { communityId: scope.communityId, postId: scope.postId }, body: {
      persona_id: scope.personaId,
      idempotency_key: crypto.randomUUID(),
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
    } };
  }
  const activities = draft.kind === "asset_bonus" || draft.activities === "either" ? ["study", "karaoke"] as const : [draft.activities];
  const reviewed = activities.map(activity => {
    const matches = policies.filter(p => p.activity === activity);
    if (matches.length !== 1) throw new Error("Qualification requirements are unavailable. Reload before reviewing.");
    return matches[0];
  });
  const versions = Object.fromEntries(reviewed.map(row => [row.activity, row.policy.qualification_policy_version_id]));
  const common = { persona_id: scope.personaId, idempotency_key: crypto.randomUUID(), expected_qualification_policy_versions: versions };
  let leg: RewardLegRequest;
  let tokenSymbol: string;
  if (draft.kind === "asset_bonus") {
    const asset = assets.find(a => a.token_address === draft.assetAddress);
    if (!asset) throw new Error("Choose an available token.");
    const perClaim = rewardAtomic(draft.perClaim, asset.token_decimals);
    if (!/^[1-9][0-9]*$/u.test(draft.claims) || !Number.isSafeInteger(Number(draft.claims))) throw new Error("Enter a whole number of recipients.");
    const amount = BigInt(perClaim) * BigInt(draft.claims);
    if (amount >= 2n ** 256n) throw new Error("The total is too large.");
    leg = { kind: "asset_bonus", input: { path: { offerId: existingOfferId ?? "" }, body: { ...common, ...asset, funding_amount_atomic: amount.toString(), amount_per_claim_atomic: perClaim, max_claims: Number(draft.claims) } } };
    tokenSymbol = asset.token_symbol;
  } else {
    const score = Number(draft.minimumScore) * 100;
    if (!Number.isInteger(score) || score < 7000 || score > 10000) throw new Error("Choose an additional score floor from 70% to 100%.");
    if (!/^[1-9][0-9]*$/u.test(draft.cutoffSeconds) || !Number.isSafeInteger(Number(draft.cutoffSeconds))) throw new Error("Enter a whole number of cutoff seconds.");
    leg = { kind: "megapot_pool", input: { path: { offerId: existingOfferId ?? "" }, body: {
      ...common, funding_amount_atomic: rewardAtomic(draft.amount, 6), max_ticket_price_atomic: rewardAtomic(draft.ticketCeiling, 6),
      entry_cutoff_seconds: Number(draft.cutoffSeconds), eligible_activities: [...activities], min_score_bps: score,
      empty_pool_policy: "no_purchase", fallback_payout_persona_id: null, fallback_disclosure_acknowledged: false,
    } } };
    tokenSymbol = "USDC";
  }
  return { offer, leg, policies: reviewed, tokenSymbol };
}
