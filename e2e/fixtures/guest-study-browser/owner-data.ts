import type { PirateApiClient } from "@pirate/api-client";
import type { OwnerStudyFinancialApi } from "../../../src/features/studying/guest-study-financial-api.ts";
import { initialSession, prepared } from "./data.ts";
export const accountCsrf = "owner-browser-csrf", originalCreditId = "credit-original", originalParticipationId = "participation-original";
export function user(id: string, verified = false): Awaited<ReturnType<PirateApiClient["get_usersMe"]>> {
  return { object: "user", id, created: 1, verification_state: verified ? "verified" : "unverified",
    verification_capabilities: { unique_human: { state: verified ? "verified" : "unverified" }, age_over_18: { state: "unverified" },
      minimum_age: { state: "unverified" }, nationality: { state: "unverified" }, gender: { state: "unverified" }, wallet_score: { state: "unverified" } } };
}
export function personas(id: string): Awaited<ReturnType<PirateApiClient["get_personas"]>> {
  const persona = `persona-${id}`;
  return { personas: [{ object: "persona", persona_id: persona, status: "active", created_at: "2026-10-13T00:00:00.000Z", retired_at: null,
    profile: { object: "persona_profile", persona_id: persona, revision: 1, display_name: id, avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
    wallet_set: { evm: null }, community_binding: { community_id: "community-1", binding_source: "first_membership" } }] };
}
export function post(): Awaited<ReturnType<PirateApiClient["get_postsPostId"]>> {
  return { downvote_count: 0, like_count: 0, machine_translated: false, post: { age_gate_policy: "none", analysis_state: "allow", authorship_mode: "human_direct",
    community: "community-1", content_safety_state: "safe", created: 1, id: "post-1", identity_mode: "public", object: "post", post_type: "song", status: "published", visibility: "public" },
    resolved_locale: "en", source_hash: null, thread_snapshot: null, translation_state: "same_language", upvote_count: 0, viewer_reaction_kinds: [], viewer_vote: null };
}
export const terms = { community_id: "community-1", post_id: "post-1", audio_revision: 1, lyrics_revision: 1, offer_id: "offer-original", pool_leg_id: "leg-original",
  original_drawing_id: "7", qualification_policy_version_id: "study_session_first_pass_v2@2", policy_hash: "a".repeat(64), terms_hash: "b".repeat(64),
  entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: prepared().disclosure.version };
export const fullPreviewHash = "c".repeat(64);
export function publicPrepared(): Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyPublicV2"]>> {
  return { ...prepared(), object: "guest_study_prepared_content_v2", reward_preview: terms, reward_preview_terms_hash: fullPreviewHash };
}
export function ownerSession(account: string, timezone = "UTC"): Awaited<ReturnType<OwnerStudyFinancialApi["startSession"]>> {
  const { actor: _actor, owner_id: _owner, expires_at: _expires, reward_mode: _mode, reward_terms: _terms, participation: _participation, ...session } = initialSession();
  return { object: "owner_account_study_session_v1", session: { ...session, object: "study_session_v2", session_id: `owner-session-${account}`,
    persona_id: `persona-${account}`, timezone, qualification_policy_revision: terms.qualification_policy_version_id }, reward_terms: terms, participation: { state: "not_yet_qualified" } };
}
export function originalCredit(): Awaited<ReturnType<OwnerStudyFinancialApi["getCredit"]>> {
  return { object: "owner_reward_credit_v1", credit_id: originalCreditId, identity_version: "owner_v1", owner_id: "100", community_id: "community-1",
    pool_leg_id: terms.pool_leg_id, original_drawing_id: terms.original_drawing_id, chain_id: 84532, token_address: `0x${"1".repeat(40)}`, token_decimals: 6,
    amount_atomic: "5", available_atomic: "5", reserved_atomic: "0", paid_atomic: "0", source_kind: "megapot_allocation", state: "credited",
    created_at: "2026-10-13T00:00:00.000Z", updated_at: "2026-10-13T00:00:00.000Z", settled_at: null, claim: { status: "unclaimed", payout_status: null }, send: null,
    recipient: { kind: "guest_owner", selection: null, binding: null } };
}
export function originalParticipation(): Awaited<ReturnType<OwnerStudyFinancialApi["getParticipation"]>> {
  return { participation_id: originalParticipationId, pool_leg_id: terms.pool_leg_id, original_drawing_id: terms.original_drawing_id, admission_state: "admitted",
    purchase_state: "confirmed", purchase_safety_deadline_at: "2026-10-13T00:00:00.000Z", reconciliation_state: "resolved", purchase_deadline_passed: true,
    allocation_id: "allocation-original", credit_id: originalCreditId, amount_atomic: "5" };
}
