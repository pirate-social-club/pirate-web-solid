import { ApiClientError } from "@pirate/api-client";
import type { GuestStudyApi, GuestStudySession } from "./guest-study-api";
import { studyAttemptResult, studyLessonPayload } from "./study-lesson-projection";
import type { StudyingAttemptInput, StudyingClient } from "./studying-route-model";

/** This answer identity is still unresolved. Retry its original payload only. */
export class GuestStudyPendingAttemptError extends Error {
  readonly code = "guest_attempt_pending";
  constructor() { super("The original answer is still awaiting confirmation."); }
}

/** A proof refusal never requests ordinary account renewal or sign-in. */
export class GuestStudyAuthorityRequiredError extends Error {
  readonly code = "guest_authority_required";
  readonly status = 401;
  constructor() { super("Restore guest access before continuing the original answer."); }
}

function sameAttempt(left: StudyingAttemptInput, right: StudyingAttemptInput): boolean {
  if (left.exercise_id !== right.exercise_id || left.attempt_number !== right.attempt_number
    || left.idempotency_key !== right.idempotency_key || left.session_id !== right.session_id
    || left.type !== right.type) return false;
  if (left.type === "translation_choice" && right.type === "translation_choice")
    return left.selected_option_id === right.selected_option_id;
  return left.type === "say_it_back" && right.type === "say_it_back"
    && left.audio === right.audio && left.content_type === right.content_type
    && left.audio_duration_ms === right.audio_duration_ms;
}

export interface GuestStudyRuntimeClientOptions {
  api: Pick<GuestStudyApi, "getSession" | "submitAnswer">;
  initialSession: GuestStudySession;
  credentialId: string | (() => string | null);
  /** Reload lacks original audio bytes and a durable answer-outcome locator. */
  readOnlyRecovery?: boolean;
}

/** Practice is a Guest source throughout; no account/persona projection is minted. */
export function createGuestStudyRuntimeClient(options: GuestStudyRuntimeClientOptions): StudyingClient {
  let session = options.initialSession;
  let unresolved: StudyingAttemptInput | undefined;
  let submitting = false;
  const original = {
    communityId: session.community_id, postId: session.post_id,
    sessionId: session.session_id, ownerId: session.owner_id,
  };
  const accept = (next: GuestStudySession): void => {
    if (next.actor.kind !== "guest" || next.reward_mode !== "practice_only"
      || next.reward_terms !== null || next.participation.state !== "practice_only"
      || next.session_id !== original.sessionId || next.owner_id !== original.ownerId
      || next.community_id !== original.communityId || next.post_id !== original.postId)
      throw new Error("The practice session does not match its original source.");
    if (next.status === "active" && (next.lesson.current === null
      || !next.items.some(item => item.session_item_id === next.lesson.current?.session_item_id)))
      throw new Error("The practice session has no confirmed current card.");
    session = next;
  };
  accept(session);
  const credentialId = (): string => {
    const id = typeof options.credentialId === "function" ? options.credentialId() : options.credentialId;
    if (id === null || id === "") throw new GuestStudyAuthorityRequiredError();
    return id;
  };
  return {
    async loadLesson(postId, signal) {
      if (postId !== original.postId) throw new Error("The Study route changed.");
      // A safe read can show progression, but cannot clear an unknown answer.
      if (unresolved !== undefined) throw new GuestStudyPendingAttemptError();
      accept(await options.api.getSession({
        path: { communityId: original.communityId, sessionId: original.sessionId },
        headers: { "x-guest-credential-id": credentialId() },
      }, signal));
      return studyLessonPayload(session);
    },
    async submitAttempt(input) {
      if (options.readOnlyRecovery) throw new GuestStudyPendingAttemptError();
      if (submitting || (unresolved !== undefined && !sameAttempt(unresolved, input)))
        throw new GuestStudyPendingAttemptError();
      if (input.session_id !== original.sessionId) throw new Error("The answer belongs to another lesson.");
      const item = session.items.find(candidate => candidate.session_item_id === input.exercise_id);
      if (item === undefined || item.exercise_type !== input.type) throw new Error("The answer belongs to another card.");
      unresolved ??= input;
      submitting = true;
      const originalInput = unresolved;
      try {
        const result = await options.api.submitAnswer({
          body: originalInput.type === "translation_choice"
            ? { kind: "single_select", choice_key: originalInput.selected_option_id }
            : originalInput.audio,
          headers: {
            "content-type": originalInput.type === "translation_choice" ? "application/json" : originalInput.content_type,
            "idempotency-key": originalInput.idempotency_key,
            "x-study-attempt-number": String(originalInput.attempt_number),
            "x-audio-duration-ms": originalInput.type === "say_it_back" ? String(originalInput.audio_duration_ms) : undefined,
            "x-guest-credential-id": credentialId(),
          },
          path: { communityId: original.communityId, sessionId: original.sessionId, sessionItemId: originalInput.exercise_id },
        });
        if (result.participation.state !== "practice_only" || result.session_item_id !== originalInput.exercise_id
          || result.attempt_number !== originalInput.attempt_number)
          throw new GuestStudyPendingAttemptError();
        accept(result.session);
        unresolved = undefined;
        return { ...studyAttemptResult(result, item.maximum_attempts), next_lesson: studyLessonPayload(session) };
      } catch (error) {
        // The original bytes stay owned until a real accepted result. No
        // timeout, 404, lease refusal or provider uncertainty permits rerecord.
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403))
          throw new GuestStudyAuthorityRequiredError();
        throw new GuestStudyPendingAttemptError();
      } finally {
        submitting = false;
      }
    },
  };
}
