import type { OwnerStudySession, OwnerStudyLocks } from "./owner-study-start-coordinator";
import { guestSession } from "./guest-study-test-fixtures";
const terms = { community_id: "community-1", post_id: "post-1", audio_revision: 1, lyrics_revision: 1,
  offer_id: "offer-1", pool_leg_id: "original-leg", original_drawing_id: "7", qualification_policy_version_id: "study_session_first_pass_v2@2",
  policy_hash: "a".repeat(64), terms_hash: "b".repeat(64), entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: "disclosure-1" };
export function ownerSession(): OwnerStudySession {
  const { actor: _actor, owner_id: _owner, expires_at: _expires, reward_mode: _mode, reward_terms: _terms, participation: _participation, ...session } = guestSession();
  return { object: "owner_account_study_session_v1", session: { ...session, object: "study_session_v2", persona_id: "explicit-persona",
    qualification_policy_revision: terms.qualification_policy_version_id }, reward_terms: terms, participation: { state: "not_yet_qualified" } };
}
export function serializedOwnerLocks(): OwnerStudyLocks {
  let tail: Promise<unknown> = Promise.resolve();
  return { exclusive: work => { const run = tail.then(work); tail = run.then(() => undefined, () => undefined); return run; } };
}
