import { decodeJournalRecord, journalChoice, journalHash, journalIdentifier, journalInteger, journalLiteral, parseJournalJson, type JournalFields, type JournalRule } from "../../api/contribution-command-codec";
import type { DanceReviewCommand } from "./dance-review-api";
import type { DanceResult, DanceResultScope } from "./dance-result-api";

export interface DanceReviewEntry extends DanceResultScope {
  readonly version: 1;
  readonly sessionId: string;
  readonly termsHash: string;
  readonly operation: DanceReviewCommand["operation"];
  readonly bodyJson: string;
}
const text: JournalRule<string> = (value): value is string => typeof value === "string";
const boolean: JournalRule<boolean> = (value): value is boolean => typeof value === "boolean";
const fields = { version: journalLiteral(1), accountId: journalIdentifier, communityId: journalIdentifier, reviewId: journalIdentifier,
  sessionId: journalIdentifier, termsHash: journalHash, operation: journalChoice(["submit", "visibility", "withdraw"]), bodyJson: text } satisfies JournalFields<DanceReviewEntry>;
const common = { idempotency_key: journalIdentifier, community_id: journalIdentifier, review_id: journalIdentifier, expected_review_revision: journalInteger };
const visibility = { ...common, show_publicly_if_passed: boolean, publication_disclosure_version: journalIdentifier };
export const danceReviewJournalKey = (scope: DanceResultScope) => `pirate:dance-review:v1:${JSON.stringify([scope.accountId, scope.communityId, scope.reviewId])}`;
export function danceReviewCommand(entry: DanceReviewEntry): DanceReviewCommand {
  const value = parseJournalJson(entry.bodyJson);
  switch (entry.operation) {
    case "submit": return decodeJournalRecord<Extract<DanceReviewCommand, { operation: "submit" }>>(value, { ...visibility, version: journalLiteral("dance-review-submit-v1"), operation: journalLiteral("submit") });
    case "visibility": return decodeJournalRecord<Extract<DanceReviewCommand, { operation: "visibility" }>>(value, { ...visibility, version: journalLiteral("dance-review-visibility-v1"), operation: journalLiteral("visibility") });
    case "withdraw": return decodeJournalRecord<Extract<DanceReviewCommand, { operation: "withdraw" }>>(value, { ...common, version: journalLiteral("dance-review-withdraw-v1"), operation: journalLiteral("withdraw") });
  }
}
export function decodeDanceReviewEntry(raw: string, scope: DanceResultScope): DanceReviewEntry {
  try {
    const entry = decodeJournalRecord<DanceReviewEntry>(parseJournalJson(raw), fields), command = danceReviewCommand(entry);
    if (danceReviewJournalKey(entry) !== danceReviewJournalKey(scope) || command.community_id !== scope.communityId || command.review_id !== scope.reviewId) throw new Error();
    return entry;
  } catch { throw new Error("dance_review_journal_corrupt"); }
}
export function matchDanceReviewEntry(entry: DanceReviewEntry, result: DanceResult): void {
  if (entry.reviewId !== result.review_id || entry.communityId !== result.community_id || entry.sessionId !== result.session_id || entry.termsHash !== result.session_terms_hash) throw new Error("dance_review_target_changed");
}
