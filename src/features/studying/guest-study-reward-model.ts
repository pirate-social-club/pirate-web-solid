import type { GuestStudyApi, GuestStudyPreparedContent, GuestStudySession } from "./guest-study-api";

export type GuestRewardTerms = NonNullable<GuestStudySession["reward_terms"]>;
/** Trusted projection of the additive119 public v2 reader. This is NOT a wire response. */
export interface AcceptedGuestRewardPreview {
  readonly terms: GuestRewardTerms;
  /** Server SHA256 of the complete native preview; NEVER terms.terms_hash or client JSON. */
  readonly requestHash: string;
}
/** Supplied only by the future genuine119 adapter; the118 public reader cannot supply this. */
export interface GuestStudyRewardPreviewReader {
  load(communityId: string, postId: string, signal?: AbortSignal): Promise<{
    prepared: GuestStudyPreparedContent; acceptedPreview: AcceptedGuestRewardPreview | null;
  }>;
}
const boundedIdentifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128
  && !/[\s\u0000-\u001f\u007f]/u.test(value);
export function canonicalGuestInstant(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 24) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
/** Cache validation mirrors the frozen12 terms fields, including canonical bounds. */
export function isGuestRewardTerms(value: unknown): value is GuestRewardTerms {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 12
    || !("community_id" in value) || !("post_id" in value) || !("audio_revision" in value) || !("lyrics_revision" in value)
    || !("offer_id" in value) || !("pool_leg_id" in value) || !("original_drawing_id" in value)
    || !("qualification_policy_version_id" in value) || !("policy_hash" in value) || !("terms_hash" in value)
    || !("entry_cutoff_at" in value) || !("disclosure_version" in value)) return false;
  return boundedIdentifier(value.community_id) && boundedIdentifier(value.post_id) && boundedIdentifier(value.offer_id) && boundedIdentifier(value.pool_leg_id)
    && boundedIdentifier(value.qualification_policy_version_id) && boundedIdentifier(value.disclosure_version)
    && typeof value.audio_revision === "number" && Number.isSafeInteger(value.audio_revision) && value.audio_revision > 0
    && typeof value.lyrics_revision === "number" && Number.isSafeInteger(value.lyrics_revision) && value.lyrics_revision > 0
    && typeof value.original_drawing_id === "string" && value.original_drawing_id.length <= 128 && /^(?:0|[1-9][0-9]*)$/u.test(value.original_drawing_id)
    && typeof value.policy_hash === "string" && /^[a-f0-9]{64}$/u.test(value.policy_hash)
    && typeof value.terms_hash === "string" && /^[a-f0-9]{64}$/u.test(value.terms_hash)
    && canonicalGuestInstant(value.entry_cutoff_at);
}
/** JSON SDK shapes do not execute frozen Effect cross-field financial filters. */
export function guestSessionRewardBindingIsValid(session: GuestStudySession): boolean {
  const terms = session.reward_terms;
  if (session.reward_mode === "practice_only") return terms === null && session.participation.state === "practice_only";
  if (terms === null || !isGuestRewardTerms(terms) || terms.community_id !== session.community_id || terms.post_id !== session.post_id
    || terms.audio_revision !== session.audio_revision || terms.lyrics_revision !== session.lyrics_revision
    || terms.qualification_policy_version_id !== session.qualification_policy_revision) return false;
  const participation = session.participation;
  return participation.state !== "admitted" || (participation.original_drawing_id === terms.original_drawing_id && participation.pool_leg_id === terms.pool_leg_id);
}
export function sameGuestRewardTerms(a: GuestRewardTerms | null, b: GuestRewardTerms | null): boolean {
  if (a === null || b === null) return a === b;
  return a.community_id === b.community_id && a.post_id === b.post_id
    && a.audio_revision === b.audio_revision && a.lyrics_revision === b.lyrics_revision
    && a.offer_id === b.offer_id && a.pool_leg_id === b.pool_leg_id
    && a.original_drawing_id === b.original_drawing_id
    && a.qualification_policy_version_id === b.qualification_policy_version_id
    && a.policy_hash === b.policy_hash && a.terms_hash === b.terms_hash
    && a.entry_cutoff_at === b.entry_cutoff_at && a.disclosure_version === b.disclosure_version;
}
export function rewardPreviewMatchesRoute(preview: AcceptedGuestRewardPreview, communityId: string, postId: string, disclosureVersion: string): boolean {
  return isGuestRewardTerms(preview.terms) && /^[a-f0-9]{64}$/u.test(preview.requestHash)
    && preview.terms.community_id === communityId && preview.terms.post_id === postId
    && preview.terms.disclosure_version === disclosureVersion;
}
export type GuestParticipation = GuestStudySession["participation"];
export type GuestParticipationProjection = Awaited<ReturnType<GuestStudyApi["listParticipations"]>>["items"][number];
export type GuestRewardStatus = "practice" | "qualifying" | "admission_pending" | "admitted"
  | "already_participating" | "closed" | "unavailable" | "ineligible" | "purchase_pending"
  | "purchased" | "no_purchase" | "held" | "allocated_zero";
export function guestParticipationStatus(value: GuestParticipation): GuestRewardStatus {
  switch (value.state) {
    case "practice_only": return "practice";
    case "not_yet_qualified": return "qualifying";
    case "pending_confirmation": return "admission_pending";
    case "entry_closed": return "closed";
    default: return value.state;
  }
}
/** A deadline does not resolve unknown admission. Only actual purchase/allocation facts do. */
export function guestPurchaseStatus(value: GuestParticipationProjection): GuestRewardStatus {
  if (value.admission_state === "pending_confirmation" || value.reconciliation_state === "pending"
    || value.purchase_state === "held_unresolved_admission") return "admission_pending";
  if (value.purchase_state === "confirmed") {
    if (value.amount_atomic !== null && BigInt(value.amount_atomic) > 0n) return "held";
    return value.amount_atomic === "0" ? "allocated_zero" : "purchased";
  }
  if (value.purchase_state === "unavailable") return "no_purchase";
  if (value.purchase_state === "pending") return "purchase_pending";
  switch (value.admission_state) {
    case "entry_closed": return "closed";
    default: return value.admission_state;
  }
}
