// Requires actual generated119 and normal maintained Vitest; never substitutes SDK types.
import type { PirateApiClient } from "@pirate/api-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createGuestStudyRewardPreviewReader, createOwnerStudyFinancialApi } from "./guest-study-financial-api";
import { prepared } from "./guest-study-test-fixtures";
const origin = "https://app.pirate.test";
beforeEach(() => vi.stubGlobal("location", { origin }));
afterEach(() => vi.unstubAllGlobals());
const terms = { community_id: "community-1", post_id: "post-1", audio_revision: 1, lyrics_revision: 1,
  offer_id: "offer-1", pool_leg_id: "original-leg", original_drawing_id: "7",
  qualification_policy_version_id: "study_session_first_pass_v2@2", policy_hash: "a".repeat(64),
  terms_hash: "b".repeat(64), entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: prepared().disclosure.version };
function client() {
  return {
    get_communitiesCommunityIdPostsPostIdStudyPublicV2: vi.fn<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyPublicV2"]>(),
    get_communitiesCommunityIdPostsPostIdStudyOwnerV1Preview: vi.fn<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyOwnerV1Preview"]>(),
    post_communitiesCommunityIdPostsPostIdStudyOwnerV1Sessions: vi.fn<PirateApiClient["post_communitiesCommunityIdPostsPostIdStudyOwnerV1Sessions"]>(),
    get_communitiesCommunityIdStudyOwnerV1SessionsSessionId: vi.fn<PirateApiClient["get_communitiesCommunityIdStudyOwnerV1SessionsSessionId"]>(),
    get_communitiesCommunityIdPostsPostIdStudyOwnerV1SessionOperationsIdempotencyKey: vi.fn<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyOwnerV1SessionOperationsIdempotencyKey"]>(),
    post_communitiesCommunityIdStudyOwnerV1SessionsSessionIdItemsSessionItemIdAnswers: vi.fn<PirateApiClient["post_communitiesCommunityIdStudyOwnerV1SessionsSessionIdItemsSessionItemIdAnswers"]>(),
    get_rewardsParticipationsOwnerV1: vi.fn<PirateApiClient["get_rewardsParticipationsOwnerV1"]>(),
    get_rewardsParticipationsParticipationIdOwnerV1: vi.fn<PirateApiClient["get_rewardsParticipationsParticipationIdOwnerV1"]>(),
    get_usersMeRewardsOwnerCreditsV1: vi.fn<PirateApiClient["get_usersMeRewardsOwnerCreditsV1"]>(),
    get_usersMeRewardsOwnerCreditsV1CreditId: vi.fn<PirateApiClient["get_usersMeRewardsOwnerCreditsV1CreditId"]>(),
  };
}
test("public default reader carries exact server full preview hash, omits credentials and never chooses leg hash", async () => {
  const c = client(); c.get_communitiesCommunityIdPostsPostIdStudyPublicV2.mockResolvedValue({ ...prepared(), object: "guest_study_prepared_content_v2", reward_preview: terms, reward_preview_terms_hash: "c".repeat(64) });
  const value = await createGuestStudyRewardPreviewReader({ origin, client: c }).load("community-1", "post-1");
  expect(value.acceptedPreview).toEqual({ terms, requestHash: "c".repeat(64) });
  expect(value.prepared.object).toBe("guest_study_prepared_content_v1");
  expect("reward_preview_terms_hash" in value.prepared).toBe(false);
  expect(c.get_communitiesCommunityIdPostsPostIdStudyPublicV2.mock.calls[0]?.[1]?.credentials).toBe("omit");
});
test("null preview stays practice, inconsistent pair and foreign activity never authorize rewards", async () => {
  const c = client(); const base = { ...prepared(), object: "guest_study_prepared_content_v2" as const, reward_preview: null, reward_preview_terms_hash: null };
  c.get_communitiesCommunityIdPostsPostIdStudyPublicV2.mockResolvedValue(base);
  expect((await createGuestStudyRewardPreviewReader({ origin, client: c }).load("community-1", "post-1")).acceptedPreview).toBeNull();
  c.get_communitiesCommunityIdPostsPostIdStudyPublicV2.mockResolvedValue({ ...base, reward_preview: terms });
  await expect(createGuestStudyRewardPreviewReader({ origin, client: c }).load("community-1", "post-1")).rejects.toThrow("preview/hash differ");
  c.get_communitiesCommunityIdPostsPostIdStudyPublicV2.mockResolvedValue({ ...base, reward_preview: { ...terms, original_drawing_id: "7", post_id: "foreign" }, reward_preview_terms_hash: "c".repeat(64) });
  await expect(createGuestStudyRewardPreviewReader({ origin, client: c }).load("community-1", "post-1")).rejects.toThrow("another activity");
});
test("Account original lookups retain exact original IDs and contain no Guest headers or body owner authority", async () => {
  const c = client(), api = createOwnerStudyFinancialApi({ origin, client: c });
  await api.getParticipation({ path: { participationId: "original-participation" } });
  await api.getCredit({ path: { creditId: "original-credit" } });
  await api.findStartOperation({ path: { communityId: "community-1", postId: "post-1", idempotencyKey: "original-start" } });
  expect(c.get_rewardsParticipationsParticipationIdOwnerV1.mock.calls[0]?.[0]).toEqual({ path: { participationId: "original-participation" } });
  expect(c.get_usersMeRewardsOwnerCreditsV1CreditId.mock.calls[0]?.[0]).toEqual({ path: { creditId: "original-credit" } });
  for (const opts of [c.get_rewardsParticipationsParticipationIdOwnerV1.mock.calls[0]?.[1], c.get_usersMeRewardsOwnerCreditsV1CreditId.mock.calls[0]?.[1]]) {
    expect(opts?.credentials).toBe("same-origin");
    const h = new Headers(opts?.headers); expect(h.has("x-guest-credential-id")).toBe(false); expect(h.has("x-guest-csrf-token")).toBe(false);
  }
  vi.stubGlobal("location", { origin: "https://name.pirate.test" });
  expect(() => api.getCredit({ path: { creditId: "original-credit" } })).toThrow("Initiating origin changed");
  expect(c.get_usersMeRewardsOwnerCreditsV1CreditId).toHaveBeenCalledOnce();
});
