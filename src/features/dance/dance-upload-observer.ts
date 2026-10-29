import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { danceJournalKey, type DanceJournalScope } from "./dance-preparation-journal";
import type { DanceSession } from "./dance-preparation-api";
import { createDanceUploadApi } from "./dance-upload-api";
import { danceUploadObservation, type DanceUploadView } from "./dance-upload-controller";

/** This adapter deliberately receives no reserve, access, PUT or finalize
 * capabilities. Observation never replays a journal or renews a media grant. */
export function createDanceUploadObserver(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly api?: Pick<ReturnType<typeof createDanceUploadApi>, "session">;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope);
  const authority = captureSessionAuthority(), api = options.api ?? createDanceUploadApi();
  const guard = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentScope();
    if (!selected || danceJournalKey(selected) !== key || !isCurrentSessionAuthority(authority)) throw new Error("dance_upload_scope_changed");
  };
  return async (expected: DanceSession, signal: AbortSignal): Promise<DanceUploadView> => {
    expected = { ...expected }; guard(signal);
    const session = await api.session(scope, expected.session_id, signal); guard(signal);
    for (const field of ["session_id", "attempt_id", "review_id", "terms_hash", "policy_hash", "consent_version", "consent_hash", "retention_hash", "expires_at_ms", "body_start_ms", "body_end_ms"] as const) {
      if (session[field] !== expected[field]) throw new Error("dance_upload_target_changed");
    }
    if (session.community_id !== scope.communityId || session.song_post_id !== scope.postId
      || session.choreography_id !== scope.choreographyId || session.choreography_revision !== scope.choreographyRevision
      || (expected.upload_id !== null && session.upload_id !== expected.upload_id)) throw new Error("dance_upload_target_changed");
    return danceUploadObservation(session, (options.nowMs ?? Date.now)()) ?? { kind: "reconciling", session };
  };
}
