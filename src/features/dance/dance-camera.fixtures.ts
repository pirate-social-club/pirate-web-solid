import reviewVideoUrl from "../../../packages/solid-ui/src/patterns/engagement/vertical-feed/fixtures/clip-1.mp4";
import { danceReviewFixtureReceipt } from "./dance-review.fixtures";
import type { DanceReviewApi } from "./dance-review-api";
import type { AuthenticatedSession } from "../../api/session";
import type { createDancePreparationApi, DanceCaptureContext, DancePreparationOptions } from "./dance-preparation-api";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import { danceResultFixtures } from "./dance-result.fixture";
import type { DanceResult } from "./dance-result-api";
import type { createDanceRecorder } from "./dance-recorder";

// Fictional browser/test responses. Hash-shaped identities do not establish
// a producer admission, real recording, provider, Post or financial effect.
export const danceCameraContext: DanceCaptureContext = { ...dancePreparationFixture,
  reward_mode: "practice", rewards_enabled: false, objectives: [], session: { ...dancePreparationFixture.session, expires_at_ms: 4070908800000 } };
export const danceFundedCameraContext: DanceCaptureContext = { ...dancePreparationFixture, session: danceCameraContext.session };
export const danceCameraScope = { accountId: "participant", communityId: "test-community", postId: "test-song", personaId: "persona", choreographyId: "dance", choreographyRevision: 1 };
export const danceCameraSession: AuthenticatedSession = { status: "authenticated", userId: "participant", personas: [
  { personaId: "persona", displayName: "Dancer", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "test-community", bindingSource: "activity_participation" } },
] };
export const danceCameraOptions: DancePreparationOptions = { version: "dance-moderated-capture-options-v1", community_id: "test-community", song_post_id: "test-song", ready: true, unavailable_code: null, next_cursor: null,
  policy: { policy_hash: danceCameraContext.session.policy_hash, consent_version: danceCameraContext.session.consent_version,
    consent_hash: danceCameraContext.session.consent_hash, retention_hash: danceCameraContext.session.retention_hash,
    publication_disclosure_version: danceCameraContext.captured_policy.publication_disclosure_version, disclosure: danceCameraContext.disclosure },
  choreographies: [{ choreography_id: "dance", revision: 1, reference_post_id: "test-reference-post", segment_id: "segment", audio_revision: 1, body_duration_ms: 10000,
    canonical_song_start_ms: 10000, canonical_song_end_ms: 20000, reference_body_start_ms: 0, reference_body_end_ms: 10000, reference_terms_hash: danceCameraContext.reference.reference_terms_hash }],
};
export function danceCameraResult(state: "awaiting" | "passed" | "withdrawn"): DanceResult {
  const result = danceResultFixtures[state];
  return { ...result, community_id: "test-community", song_post_id: "test-song", review_id: danceCameraContext.session.review_id,
    session_id: danceCameraContext.session.session_id, attempt_id: danceCameraContext.session.attempt_id, session_terms_hash: danceCameraContext.session.terms_hash, review_deadline: "2099-01-08T00:00:00.000Z" };
}
export function createDanceCameraFixtureApi(context: DanceCaptureContext = danceCameraContext): ReturnType<typeof createDancePreparationApi> {
  return { owner: async () => false, options: async () => danceCameraOptions,
    latest: async () => ({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: null }),
    session: async () => context.session, context: async () => context,
    create: async () => ({ version: "dance-moderated-intake-receipt-v1", receipt_id: "create-receipt", operation: "create", session: context.session }),
    consent: async () => ({ version: "dance-moderated-intake-receipt-v1", receipt_id: "consent-receipt", operation: "consent", session: { ...context.session, state: "consented" } }),
    preparePersona: async () => ({ object: "activity_persona_preparation", community_id: "test-community", persona_id: "persona", persona_status: "active", activity_presentation: null }) };
}
export function createDanceCameraFixtureRecorder(_options: Parameters<typeof createDanceRecorder>[0], context: DanceCaptureContext = danceCameraContext): ReturnType<typeof createDanceRecorder> {
  let stream: MediaStream | undefined, original: File | undefined;
  const ready = { kind: "capture_ready" as const, session: { ...context.session, state: "consented" as const },
    context: { ...context, session: { ...context.session, state: "consented" as const } }, assertCurrent: () => {} };
  const dispose = () => { for (const track of stream?.getTracks() ?? []) track.stop(); };
  return {
    pause: dispose, localPreview: async () => null,
    observe: async () => ({ kind: "upload", upload: { kind: "review", session: { ...ready.session, state: "uploaded", upload_state: "sealed", upload_id: "upload" } } }),
    prepare: async () => ({ kind: "objectives", session: context.session, context }),
    enter: async () => {
      const response = await fetch(reviewVideoUrl);
      if (!response.ok) throw new Error("Fictional preview asset unavailable");
      original = new File([await response.blob()], "fixture-recording.mp4", { type: "video/mp4" });
      const canvas = document.createElement("canvas"); canvas.width = 180; canvas.height = 320;
      const context = canvas.getContext("2d"); if (context) { context.fillStyle = "#243048"; context.fillRect(0, 0, 180, 320); }
      // Real canvas preview in Storybook; jsdom tests replace this factory.
      stream = canvas.captureStream(10); return { kind: "camera", ready, stream };
    },
    record: async (_signal, stage, progress, preview) => {
      stage("preparing_audio"); await Promise.resolve(); stage("recording"); progress(1000); await Promise.resolve();
      if (!original) throw new Error("Fictional original unavailable");
      preview?.({ sessionId: ready.session.session_id, termsHash: ready.session.terms_hash, durationMs: ready.session.body_end_ms, file: original }, ready.session.expires_at_ms);
      stage("saving"); await Promise.resolve(); stage("uploading"); dispose();
      return { kind: "upload", upload: { kind: "processing", session: { ...ready.session, state: "awaiting_upload", upload_id: "upload", upload_state: "sealing" } } };
    },
    recover: async () => ({ kind: "upload", upload: { kind: "review", session: { ...ready.session, state: "uploaded", upload_state: "sealed", upload_id: "upload" } } }),
    resume: async () => ({ kind: "upload", upload: { kind: "processing", session: { ...ready.session, state: "awaiting_upload", upload_id: "upload", upload_state: "sealing" } } }),
    newAttempt: async () => ({ kind: "objectives", session: context.session, context }), dispose,
  };
}

export function createDanceCameraReviewFixtureApi(): DanceReviewApi {
  let result: DanceResult = { ...danceCameraResult("awaiting"), state: "uploaded", show_publicly_if_passed: null, initial_submit_receipt: null, submitted_at: null, cue_attestation: null };
  return { read: async () => result, postingEligibility: async () => ({ kind: "eligible" }), disclosure: async () => "disclosure-v1",
    media: async () => { throw new Error("This fixture supplies its local playable preview separately"); },
    command: async (_scope, body) => {
      result = body.operation === "withdraw" ? danceCameraResult("withdrawn") : { ...danceCameraResult("awaiting"), review_revision: result.review_revision + 1, show_publicly_if_passed: body.show_publicly_if_passed };
      return danceReviewFixtureReceipt(body, result);
    },
  };
}
