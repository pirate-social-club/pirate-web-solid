import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { decodeJournalRecord, journalHash, journalIdentifier, journalInteger, journalLiteral, journalChoice, parseJournalJson, type JournalFields, type JournalRule } from "../../api/contribution-command-codec";
import type { DanceJournalStore } from "./dance-preparation-journal";
import type { DanceResultScope } from "./dance-result-api";
import type { DanceReviewReceipt } from "./dance-review-api";
import { assertDanceOwnerReceipt, assertDanceOwnerRecording, type DanceOwnerApi, type DanceOwnerRecording, type DanceOwnerVerdict } from "./dance-owner-api";

interface Entry extends DanceResultScope { readonly version: 1; readonly termsHash: string; readonly rubricHash: string; readonly bodyJson: string }
const text: JournalRule<string> = (v): v is string => typeof v === "string";
const fields = { version: journalLiteral(1), accountId: journalIdentifier, communityId: journalIdentifier, reviewId: journalIdentifier, termsHash: journalHash, rubricHash: journalHash, bodyJson: text } satisfies JournalFields<Entry>;
const bodyFields = { version: journalLiteral("dance-owner-verdict-attestation-v1"), operation: journalLiteral("verdict"), idempotency_key: journalIdentifier,
  community_id: journalIdentifier, review_id: journalIdentifier, expected_review_revision: journalInteger, verdict: journalChoice(["passed", "not_passed"]) } satisfies JournalFields<DanceOwnerVerdict>;
export const danceOwnerJournalKey = (scope: DanceResultScope) => `pirate:dance-owner:v1:${JSON.stringify([scope.accountId, scope.communityId, scope.reviewId])}`;
function decode(raw: string, scope: DanceResultScope) {
  try {
    const entry = decodeJournalRecord<Entry>(parseJournalJson(raw), fields), body = decodeJournalRecord<DanceOwnerVerdict>(parseJournalJson(entry.bodyJson), bodyFields);
    if (danceOwnerJournalKey(entry) !== danceOwnerJournalKey(scope) || body.community_id !== scope.communityId || body.review_id !== scope.reviewId) throw new Error();
    return { entry, body };
  } catch { throw new Error("dance_owner_journal_corrupt"); }
}
export type DanceOwnerView = { readonly kind: "review"; readonly recording: DanceOwnerRecording } | { readonly kind: "receipt"; readonly receipt: DanceReviewReceipt };

/** A terminal review leaves the owner's queue. Recovery therefore replays the
 * original verdict before attempting detail. A receipt is explicitly historical,
 * never a current dancer result or a fresh media authorization. */
export function createDanceOwnerController(options: { readonly scope: DanceResultScope; readonly currentScope: () => DanceResultScope | null; readonly store: DanceJournalStore; readonly api: DanceOwnerApi; readonly commandKey?: () => string }) {
  const scope = Object.freeze({ ...options.scope }), key = danceOwnerJournalKey(scope), authority = captureSessionAuthority(), store = options.store, api = options.api;
  const current = (signal: AbortSignal) => { signal.throwIfAborted(); const selected = options.currentScope(); if (!isCurrentSessionAuthority(authority) || !selected || danceOwnerJournalKey(selected) !== key) throw new Error("dance_owner_scope_changed"); };
  const replay = async (raw: string, signal: AbortSignal): Promise<DanceOwnerView> => {
    const { entry, body } = decode(raw, scope); current(signal);
    const receipt = await api.verdict(scope, body, signal); current(signal); assertDanceOwnerReceipt(receipt, body, scope);
    if (receipt.result.session_terms_hash !== entry.termsHash || receipt.result.captured_policy.rubric_hash !== entry.rubricHash) throw new Error("dance_owner_receipt_mismatch");
    if (store.read(key) !== raw) throw new Error("dance_owner_journal_changed");
    store.remove(key); current(signal); if (store.read(key) !== null) throw new Error("dance_owner_journal_unavailable");
    return { kind: "receipt", receipt };
  };
  return {
    async load(signal: AbortSignal): Promise<DanceOwnerView> {
      current(signal);
      return store.exclusive(key, async () => {
        current(signal); const raw = store.read(key); if (raw !== null) return replay(raw, signal);
        const recording = await api.detail(scope, signal); current(signal); assertDanceOwnerRecording(recording, scope); return { kind: "review", recording };
      });
    },
    async decide(expected: DanceOwnerRecording, verdict: DanceOwnerVerdict["verdict"], signal: AbortSignal): Promise<DanceOwnerView> {
      current(signal); assertDanceOwnerRecording(expected, scope); const selected = JSON.stringify(expected);
      return store.exclusive(key, async () => {
        current(signal); const outstanding = store.read(key); if (outstanding !== null) return replay(outstanding, signal);
        const recording = await api.detail(scope, signal); current(signal); assertDanceOwnerRecording(recording, scope);
        if (JSON.stringify(recording) !== selected) throw new Error("dance_owner_target_changed");
        if (Date.parse(recording.detail.review.review_deadline) <= Date.now()) throw new Error("dance_owner_deadline_reached");
        const body: DanceOwnerVerdict = { version: recording.detail.attestation_version, operation: "verdict", idempotency_key: (options.commandKey ?? (() => crypto.randomUUID()))(), community_id: scope.communityId, review_id: scope.reviewId, expected_review_revision: recording.detail.review.review_revision, verdict };
        const entry: Entry = { ...scope, version: 1, termsHash: recording.rubric.session_terms_hash, rubricHash: recording.rubric.rubric_hash, bodyJson: JSON.stringify(body) };
        const raw = JSON.stringify(entry); decode(raw, scope); current(signal); store.write(key, raw); current(signal);
        if (store.read(key) !== raw) throw new Error("dance_owner_journal_unavailable");
        return replay(raw, signal);
      });
    },
  };
}
