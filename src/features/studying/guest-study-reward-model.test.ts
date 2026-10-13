import { describe, expect, test } from "vitest";
import { guestParticipationStatus, guestPurchaseStatus, guestSessionRewardBindingIsValid, isGuestRewardTerms, rewardPreviewMatchesRoute, sameGuestRewardTerms, type GuestParticipationProjection, type GuestRewardTerms } from "./guest-study-reward-model";
import { guestSession } from "./guest-study-test-fixtures";
const terms: GuestRewardTerms = { community_id: "community-1", post_id: "post-1", audio_revision: 1, lyrics_revision: 1,
  offer_id: "offer", pool_leg_id: "leg", original_drawing_id: "123", qualification_policy_version_id: "policy@2", policy_hash: "a".repeat(64), terms_hash: "b".repeat(64),
  entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: "disclosure" };
const projection: GuestParticipationProjection = { participation_id: "original", original_drawing_id: "123", pool_leg_id: "leg",
  admission_state: "admitted", purchase_state: "not_requested", purchase_safety_deadline_at: "2026-10-14T10:00:00.000Z", reconciliation_state: "resolved", purchase_deadline_passed: false,
  allocation_id: null, credit_id: null, amount_atomic: null };
describe("original Guest financial status", () => {
  test("lesson completion and admitted share cannot imply a purchased entry", () => {
    expect(guestParticipationStatus({ state: "admitted", share_id: "share", original_drawing_id: "123", pool_leg_id: "leg" })).toBe("admitted");
    expect(guestPurchaseStatus(projection)).toBe("admitted");
    expect(guestPurchaseStatus({ ...projection, purchase_state: "confirmed" })).toBe("purchased");
  });
  test("ambiguous admission holds before and after the purchase safety deadline", () => {
    for (const purchase_deadline_passed of [false, true]) expect(guestPurchaseStatus({ ...projection,
      admission_state: "pending_confirmation", purchase_state: "held_unresolved_admission", reconciliation_state: "pending", purchase_deadline_passed })).toBe("admission_pending");
    expect(guestPurchaseStatus({ ...projection, purchase_state: "unavailable", purchase_deadline_passed: true })).toBe("no_purchase");
  });
  test("only confirmed positive allocation is held; zero is never positive winnings", () => {
    expect(guestPurchaseStatus({ ...projection, purchase_state: "confirmed", allocation_id: "allocation", credit_id: "credit", amount_atomic: "1" })).toBe("held");
    expect(guestPurchaseStatus({ ...projection, purchase_state: "confirmed", allocation_id: "allocation", amount_atomic: "0" })).toBe("allocated_zero");
  });
  test("server-issued preview hash is separate from leg terms hash and binds initiating activity/disclosure", () => {
    expect(rewardPreviewMatchesRoute({ terms, requestHash: "c".repeat(64) }, "community-1", "post-1", "disclosure")).toBe(true);
    expect(rewardPreviewMatchesRoute({ terms, requestHash: "c".repeat(64) }, "community-1", "post-2", "disclosure")).toBe(false);
    expect(rewardPreviewMatchesRoute({ terms, requestHash: "c".repeat(64) }, "community-1", "post-1", "other")).toBe(false);
    expect(sameGuestRewardTerms(terms, { ...terms, original_drawing_id: "124" })).toBe(false);
    expect(sameGuestRewardTerms(terms, { ...terms, offer_id: "different" })).toBe(false);
    expect(sameGuestRewardTerms(terms, structuredClone(terms))).toBe(true);
  });
});


test("frozen financial cross-field filters reject structurally valid replacement provenance", () => {
  const valid = guestSession({ qualification_policy_revision: terms.qualification_policy_version_id, reward_mode: "megapot_guest_v1", reward_terms: terms,
    participation: { state: "admitted", share_id: "share", original_drawing_id: terms.original_drawing_id, pool_leg_id: terms.pool_leg_id } });
  expect(guestSessionRewardBindingIsValid(valid)).toBe(true);
  for (const wrong of [
    { ...valid, audio_revision: 2 }, { ...valid, lyrics_revision: 2 }, { ...valid, qualification_policy_revision: "replacement-policy" },
    { ...valid, participation: { state: "admitted" as const, share_id: "share", original_drawing_id: "124", pool_leg_id: terms.pool_leg_id } },
    { ...valid, participation: { state: "admitted" as const, share_id: "share", original_drawing_id: terms.original_drawing_id, pool_leg_id: "replacement-leg" } },
  ]) expect(guestSessionRewardBindingIsValid(wrong)).toBe(false);
});
test("cache rejects noncanonical instants and frozen identifier/drawing bounds", () => {
  expect(isGuestRewardTerms(terms)).toBe(true);
  for (const invalid of [
    { ...terms, community_id: "x".repeat(129) }, { ...terms, post_id: "contains space" }, { ...terms, offer_id: "control\u0000" },
    { ...terms, original_drawing_id: "1".repeat(129) }, { ...terms, original_drawing_id: "01" },
    { ...terms, entry_cutoff_at: "2026-10-14T10:00:00Z" }, { ...terms, entry_cutoff_at: "2026-10-14T10:00:00.000+00:00" },
    { ...terms, entry_cutoff_at: "invalid" }, { ...terms, audio_revision: Number.MAX_SAFE_INTEGER + 1 },
  ]) expect(isGuestRewardTerms(invalid)).toBe(false);
});
