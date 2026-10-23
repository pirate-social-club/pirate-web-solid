import type { DanceOwnerApi, DanceOwnerRecording, DanceOwnerVerdict } from "./dance-owner-api";
import type { DanceReviewReceipt } from "./dance-review-api";
import { danceReviewFixtures } from "./dance-review.fixtures";
import { danceResultFixtures } from "./dance-result.fixture";

// Fictional owner projections for tests/Storybook. No real recording or policy admission.
export const danceOwnerScope = { accountId: "owner-account", communityId: "community", reviewId: "review" };
export const danceOwnerFixture: DanceOwnerRecording = {
  detail: { object: "dance_owner_review", review: { review_id: "review", review_revision: 3, community_id: "community", song_post_id: "song", choreography_id: "dance", choreography_revision: 1, segment_id: "segment", submitted_at: "2026-10-22T10:00:00.000Z", review_deadline: "2099-01-08T00:00:01.000Z", state: "awaiting_review" },
    reference_post_id: "reference", video_render_revision: "render-v1", cue: { id: "arms_t", start_ms: 0, end_ms: 2000, hold_ms: 1000 }, body: { start_ms: 2000, end_ms: 17_000 }, rubric_version: "rubric-v1", rubric_hash: "c".repeat(64), attestation_version: "dance-owner-verdict-attestation-v1" },
  rubric: { version: "dance-moderated-owner-rubric-v1", community_id: "community", review_id: "review", review_revision: 3, session_terms_hash: "3".repeat(64), policy_hash: "a".repeat(64), rubric_version: "rubric-v1", rubric_hash: "c".repeat(64), rubric_text: "Inspect the assigned cue before the dance interval and the performance of the selected dance.", attestation_version: "dance-owner-verdict-attestation-v1" },
};
export const danceOwnerFixtureReceipt = (body: DanceOwnerVerdict, refusal: string | null = null): DanceReviewReceipt => ({
  version: "dance-review-receipt-v1", receipt_id: `receipt-${body.idempotency_key}`, review_id: body.review_id, operation: "verdict", outcome: refusal === null ? "applied" : "refused", refusal_code: refusal, committed_at: "2026-10-22T10:01:00.000Z",
  result: refusal ? danceReviewFixtures.awaiting : { ...danceResultFixtures[body.verdict === "passed" ? "passed" : "notPassed"], review_deadline: danceOwnerFixture.detail.review.review_deadline },
});
export function createDanceOwnerFixtureApi(loseReply = false): DanceOwnerApi {
  let lost = false; const receipts = new Map<string, DanceReviewReceipt>();
  return { queue: async () => ({ object: "dance_owner_review_page", items: [danceOwnerFixture.detail.review], next_cursor: null }), detail: async () => danceOwnerFixture,
    media: async () => { throw new Error("No real media in this fixture"); },
    verdict: async (_scope, body) => { const previous = receipts.get(body.idempotency_key); if (previous) return previous; const receipt = danceOwnerFixtureReceipt(body); receipts.set(body.idempotency_key, receipt); if (loseReply && !lost) { lost = true; throw new Error("Fictional lost reply"); } return receipt; } };
}
