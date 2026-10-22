import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import type { DanceJournalStore } from "./dance-preparation-journal";
import { assertDanceResult, type DanceResult, type DanceResultScope } from "./dance-result-api";
import { assertDanceReviewReceipt, createDanceReviewApi, danceReviewEditable, danceReviewPending, type DanceReviewApi, type DanceReviewCommand, type DanceReviewReceipt } from "./dance-review-api";
import { danceReviewCommand, danceReviewJournalKey, decodeDanceReviewEntry, matchDanceReviewEntry, type DanceReviewEntry } from "./dance-review-journal";

export interface DanceReviewView { readonly result: DanceResult; readonly receipt: DanceReviewReceipt | null }
export type DanceReviewIntent = { readonly operation: "submit" | "visibility"; readonly showPublicly: boolean } | { readonly operation: "withdraw" };

/** One outstanding original command per account/review. A lost receipt or
 * fresh-read failure retains its body/key. No optimistic state or new key on
 * retry; fresh GET after the historical receipt decides the displayed result. */
export function createDanceReviewController(options: {
  readonly scope: DanceResultScope;
  readonly currentScope: () => DanceResultScope | null;
  readonly store: DanceJournalStore;
  readonly api?: DanceReviewApi;
  readonly commandKey?: () => string;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceReviewJournalKey(scope), store = options.store;
  const authority = captureSessionAuthority(), api = options.api ?? createDanceReviewApi(), commandKey = options.commandKey ?? (() => crypto.randomUUID());
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentScope();
    if (!isCurrentSessionAuthority(authority) || !selected || danceReviewJournalKey(selected) !== key) throw new Error("dance_review_scope_changed");
  };
  const read = () => { const raw = store.read(key); return raw === null ? null : decodeDanceReviewEntry(raw, scope); };
  const resolve = async (entry: DanceReviewEntry, signal: AbortSignal, guard: () => void): Promise<DanceReviewView> => {
    guard(); const original = JSON.stringify(entry), command = danceReviewCommand(entry);
    const receipt = await api.command(scope, command, signal); guard();
    assertDanceReviewReceipt(receipt, command, scope); matchDanceReviewEntry(entry, receipt.result);
    const result = await api.read(scope, signal); guard(); assertDanceResult(result, scope); matchDanceReviewEntry(entry, result);
    if (result.review_revision < receipt.result.review_revision) throw new Error("dance_review_stale_read");
    const retained = read(); if (!retained || JSON.stringify(retained) !== original) throw new Error("dance_review_journal_changed");
    store.remove(key); guard(); if (store.read(key) !== null) throw new Error("dance_review_journal_unavailable");
    return { result, receipt };
  };
  return {
    async load(signal: AbortSignal): Promise<DanceReviewView> {
      const guard = () => current(signal); guard();
      return store.exclusive(key, async () => {
        guard(); const entry = read(); guard(); if (entry) return resolve(entry, signal, guard);
        const result = await api.read(scope, signal); guard(); assertDanceResult(result, scope); return { result, receipt: null };
      });
    },
    async act(expected: DanceResult, intent: DanceReviewIntent, signal: AbortSignal): Promise<DanceReviewView> {
      expected = { ...expected }; intent = { ...intent };
      const guard = () => current(signal); guard(); assertDanceResult(expected, scope);
      return store.exclusive(key, async () => {
        guard(); const outstanding = read(); guard(); if (outstanding) return resolve(outstanding, signal, guard);
        const result = await api.read(scope, signal); guard(); assertDanceResult(result, scope);
        if (result.session_id !== expected.session_id || result.session_terms_hash !== expected.session_terms_hash
          || result.review_revision !== expected.review_revision || result.state !== expected.state) throw new Error("dance_review_changed");
        if (!danceReviewEditable(result) || (intent.operation === "submit" && result.state !== "uploaded")
          || (intent.operation === "visibility" && !danceReviewPending(result))) throw new Error("dance_review_closed");
        const common = { idempotency_key: commandKey(), community_id: scope.communityId, review_id: scope.reviewId, expected_review_revision: result.review_revision };
        let body: DanceReviewCommand;
        if (intent.operation === "withdraw") body = { ...common, version: "dance-review-withdraw-v1", operation: "withdraw" };
        else {
          const disclosure = result.initial_submit_receipt?.publication_disclosure_version ?? await api.disclosure(scope, result, signal); guard();
          body = intent.operation === "submit"
            ? { ...common, version: "dance-review-submit-v1", operation: "submit", show_publicly_if_passed: intent.showPublicly, publication_disclosure_version: disclosure }
            : { ...common, version: "dance-review-visibility-v1", operation: "visibility", show_publicly_if_passed: intent.showPublicly, publication_disclosure_version: disclosure };
        }
        guard(); if (read() !== null) throw new Error("dance_review_journal_changed");
        const entry: DanceReviewEntry = { ...scope, version: 1, sessionId: result.session_id, termsHash: result.session_terms_hash, operation: body.operation, bodyJson: JSON.stringify(body) };
        const raw = JSON.stringify(entry); decodeDanceReviewEntry(raw, scope); store.write(key, raw); guard();
        if (store.read(key) !== raw) throw new Error("dance_review_journal_unavailable");
        return resolve(entry, signal, guard);
      });
    },
  };
}
