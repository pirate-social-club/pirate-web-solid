import type { StudySession, StudyV2Api } from "./study-v2-api";
import type {
  StudyingAttemptInput,
  StudyingClient,
} from "./studying-route-model";
import { studyAttemptResult, studyLessonPayload } from "./study-lesson-projection";
export { studyLessonPayload } from "./study-lesson-projection";

export interface StudyV2RuntimeClientOptions {
  api: StudyV2Api;
  initialSession: StudySession;
}

/** Adapts the generated v2 session and raw-answer contract to the shared Study surface seam. */
export function createStudyV2RuntimeClient(options: StudyV2RuntimeClientOptions): StudyingClient {
  let session = options.initialSession;

  return {
    async loadLesson(_postId, signal) {
      session = await options.api.getSession({
        communityId: session.community_id,
        sessionId: session.session_id,
        signal,
      });
      return studyLessonPayload(session);
    },
    async submitAttempt(input: StudyingAttemptInput) {
      const item = session.items.find((candidate) => candidate.session_item_id === input.exercise_id);
      if (!item) throw new Error("The current Study card is no longer in this session.");
      const result = input.type === "translation_choice"
        ? await options.api.submitChoice({
            attemptNumber: input.attempt_number,
            choiceKey: input.selected_option_id,
            communityId: session.community_id,
            idempotencyKey: input.idempotency_key,
            sessionId: session.session_id,
            sessionItemId: input.exercise_id,
          })
        : await options.api.submitAudio({
            attemptNumber: input.attempt_number,
            audio: input.audio,
            audioDurationMs: input.audio_duration_ms,
            communityId: session.community_id,
            contentType: input.content_type,
            idempotencyKey: input.idempotency_key,
            sessionId: session.session_id,
            sessionItemId: input.exercise_id,
          });
      session = result.session;
      return {
        ...studyAttemptResult(result, item.maximum_attempts),
        next_lesson: studyLessonPayload(result.session),
      };
    },
  };
}
