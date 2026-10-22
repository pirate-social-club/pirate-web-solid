import type { DanceJournalStore } from "./dance-preparation-journal";
import { danceResultFixtures } from "./dance-result.fixture";
import type { DanceResult } from "./dance-result-api";
import type { DanceReviewReceipt, DanceReviewCommand } from "./dance-review-api";

// Test/Storybook fixtures only. No real recording, source authority, admission or payment.
export const danceReviewScope = { accountId: "participant", communityId: "community", reviewId: "review" };
const deadline = "2099-01-08T00:00:01.000Z";
export const danceReviewFixtures = {
  uploaded: { ...danceResultFixtures.uploaded, review_deadline: deadline },
  awaiting: { ...danceResultFixtures.awaiting, review_deadline: deadline },
  passed: { ...danceResultFixtures.passed, review_deadline: deadline },
  withdrawn: { ...danceResultFixtures.withdrawn, review_deadline: deadline },
} satisfies Readonly<Record<string, DanceResult>>;
export const danceReviewFixtureReceipt = (body: DanceReviewCommand, result: DanceResult, refused: string | null = null): DanceReviewReceipt => {
  const receiptId = `receipt-${body.idempotency_key}`;
  if (body.operation === "submit" && refused === null) result = { ...result, show_publicly_if_passed: body.show_publicly_if_passed,
    initial_submit_receipt: { receipt_id: receiptId, show_publicly_if_passed: body.show_publicly_if_passed, publication_disclosure_version: body.publication_disclosure_version, submitted_at: result.submitted_at ?? "2026-10-22T10:00:00.000Z" } };
  return { version: "dance-review-receipt-v1", receipt_id: receiptId, review_id: body.review_id, operation: body.operation,
    outcome: refused === null ? "applied" : "refused", refusal_code: refused, committed_at: "2026-10-22T10:00:00.000Z", result };
};
export function createDanceReviewFixtureStore() {
  const entries = new Map<string, string>();
  let previous: Promise<unknown> = Promise.resolve();
  const store: DanceJournalStore = { read: key => entries.get(key) ?? null, write: (key, value) => { entries.set(key, value); }, remove: key => { entries.delete(key); },
    exclusive<T>(_key: string, operation: () => Promise<T>): Promise<T> {
      const next = previous.then(operation); previous = next.catch(() => {}); return next;
    } };
  return { entries, store };
}
