import { describe, expect, it } from "vitest";
import { qualificationText, rewardAtomic, sponsorTerms, type SponsorDraft } from "./reward-sponsor-terms.ts";
import type { RewardPolicy } from "../../api/reward-sponsor-data.ts";
const scope = { accountId: "account", personaId: "persona", communityId: "community", postId: "song" };
const policies: RewardPolicy[] = [
  { activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000 } },
  { activity: "karaoke", policy: { kind: "karaoke_qualification_v2", qualification_policy_version_id: "karaoke-v2", minimum_coverage_bps: 8500, minimum_final_score_bps: 7000, minimum_scored_line_count: 5, eligible_playback_kinds: ["full_mix", "instrumental"] } },
];
const asset = { chain_id: 84532 as const, token_address: `0x${"a".repeat(40)}`, token_decimals: 6, token_symbol: "PSTB", asset_policy_version: "asset-v1" };
const draft: SponsorDraft = { kind: "megapot_pool", amount: "18", perClaim: "0.1", claims: "3", assetAddress: asset.token_address, activities: "either", minimumScore: "80", ticketCeiling: "1", cutoffSeconds: "60", endsAt: "2026-09-15T00:00:00Z" };
const now = new Date("2026-09-08T00:00:00Z");
describe("reviewed reward terms", () => {
  it("uses exact atomic arithmetic and rejects silent rounding", () => {
    expect(rewardAtomic("0.1",6)).toBe("100000");
    expect(() => rewardAtomic("0.0000001",6)).toThrow("decimal places");
    expect(() => rewardAtomic("1e3",6)).toThrow();
  });
  it("sends both Megapot activities explicitly with the additional score floor", () => {
    const result = sponsorTerms(scope,draft,[asset],policies,now);
    expect(result.leg.input.body).toMatchObject({ eligible_activities: ["study","karaoke"], min_score_bps: 8000, empty_pool_policy: "no_purchase", expected_qualification_policy_versions: { study: "study-v2", karaoke: "karaoke-v2" } });
  });
  it("never sends activity or score settings for an asset bonus", () => {
    const result = sponsorTerms(scope,{ ...draft, kind: "asset_bonus", activities: "study" },[asset],policies,now);
    expect(result.leg.input.body).toMatchObject({ funding_amount_atomic: "300000", amount_per_claim_atomic: "100000", max_claims: 3 });
    expect(result.leg.input.body).not.toHaveProperty("eligible_activities");
    expect(result.leg.input.body).not.toHaveProperty("min_score_bps");
    expect(result.policies).toHaveLength(2);
  });
  it("refuses custom or retired tokens and missing policies", () => {
    expect(() => sponsorTerms(scope,{ ...draft, kind: "asset_bonus" },[],policies,now)).toThrow("available token");
    expect(() => sponsorTerms(scope,draft,[asset],policies.slice(0,1),now)).toThrow("requirements are unavailable");
  });
  it("discloses all karaoke gates and playback restrictions", () => {
    expect(qualificationText(policies[1])).toBe("Singing: 70% score, 85% coverage and at least 5 scored lines. Eligible tracks: full mix or instrumental.");
  });
});
