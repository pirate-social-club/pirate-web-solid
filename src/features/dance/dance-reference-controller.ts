import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { decodeJournalRecord, journalIdentifier, journalLiteral, parseJournalJson, type JournalFields, type JournalRule } from "../../api/contribution-command-codec";
import type { DanceJournalStore } from "./dance-preparation-journal";
import { assertDanceReferenceStatus, danceReferenceIdentity, type DanceReferenceApi, type DanceReferenceCommand, type DanceReferenceScope, type DanceReferenceStatus, type DanceReferenceTarget } from "./dance-reference-api";

export interface DanceReferenceLocator { readonly accountId: string; readonly referencePostId: string }
interface Entry extends DanceReferenceScope { readonly version: 1; readonly bodyJson: string; readonly choreographyId: string | null }
const text: JournalRule<string> = (v): v is string => typeof v === "string";
const nullableId: JournalRule<string | null> = (v): v is string | null => v === null || journalIdentifier(v);
const fields = { version: journalLiteral(1), accountId: journalIdentifier, communityId: journalIdentifier, postId: journalIdentifier,
  referenceCommunityId: journalIdentifier, referencePostId: journalIdentifier, authorPersonaId: journalIdentifier,
  bodyJson: text, choreographyId: nullableId } satisfies JournalFields<Entry>;
const commandFields = { version: journalLiteral("dance-moderated-reference-create-v1"), idempotency_key: journalIdentifier,
  community_id: journalIdentifier, song_post_id: journalIdentifier, reference_post_id: journalIdentifier, persona_id: journalIdentifier } satisfies JournalFields<DanceReferenceCommand>;
export const danceReferenceJournalKey = (s: DanceReferenceLocator) => `pirate:dance-reference:v1:${JSON.stringify([s.accountId, s.referencePostId])}`;
const scopeOf = (s: DanceReferenceScope): DanceReferenceScope => ({ accountId: s.accountId, communityId: s.communityId, postId: s.postId,
  referenceCommunityId: s.referenceCommunityId, referencePostId: s.referencePostId, authorPersonaId: s.authorPersonaId });
function decode(raw: string, locator: DanceReferenceLocator) {
  try {
    const entry = decodeJournalRecord<Entry>(parseJournalJson(raw), fields);
    const body = decodeJournalRecord<DanceReferenceCommand>(parseJournalJson(entry.bodyJson), commandFields);
    if (danceReferenceJournalKey(entry) !== danceReferenceJournalKey(locator) || body.community_id !== entry.communityId
      || body.song_post_id !== entry.postId || body.reference_post_id !== entry.referencePostId) throw new Error();
    return { entry, body };
  } catch { throw new Error("dance_reference_journal_corrupt"); }
}
export type DanceReferenceView = { readonly kind: "draft"; readonly target: DanceReferenceTarget }
  | { readonly kind: "needs_check"; readonly scope: DanceReferenceScope; readonly personaId: string }
  | { readonly kind: "status"; readonly scope: DanceReferenceScope; readonly personaId: string; readonly reference: DanceReferenceStatus };

/** Page load performs reads only. An uncertain Create can only be explicitly
 * replayed with its original body/key. The saved command is retained even when
 * the video becomes unreadable, a reply is lost, or the browser restarts. */
export function createDanceReferenceController(options: {
  readonly locator: DanceReferenceLocator;
  readonly currentLocator: () => DanceReferenceLocator | null;
  readonly api: DanceReferenceApi;
  readonly store: DanceJournalStore;
  readonly commandKey?: () => string;
}) {
  const locator = Object.freeze({ ...options.locator }), key = danceReferenceJournalKey(locator);
  const authority = captureSessionAuthority(), { api, store } = options;
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentLocator();
    if (!isCurrentSessionAuthority(authority) || !selected || danceReferenceJournalKey(selected) !== key) throw new Error("dance_reference_scope_changed");
  };
  const saved = (entry: Entry, before: string | null, signal: AbortSignal) => {
    current(signal); if (store.read(key) !== before) throw new Error("dance_reference_journal_changed");
    const raw = JSON.stringify(entry); decode(raw, locator); store.write(key, raw); current(signal);
    if (store.read(key) !== raw) throw new Error("dance_reference_journal_unavailable"); return raw;
  };
  const read = async (raw: string, signal: AbortSignal): Promise<DanceReferenceView> => {
    const { entry, body } = decode(raw, locator); current(signal);
    if (entry.choreographyId === null) return { kind: "needs_check", scope: scopeOf(entry), personaId: body.persona_id };
    const reference = await api.status(scopeOf(entry), entry.choreographyId, signal); current(signal);
    assertDanceReferenceStatus(reference, entry, entry.choreographyId);
    if (store.read(key) !== raw) throw new Error("dance_reference_journal_changed");
    return { kind: "status", scope: scopeOf(entry), personaId: body.persona_id, reference };
  };
  const dispatch = async (raw: string, signal: AbortSignal): Promise<DanceReferenceView> => {
    const { entry, body } = decode(raw, locator); current(signal);
    if (entry.choreographyId !== null) return read(raw, signal);
    const receipt = await api.create(scopeOf(entry), body, signal); current(signal); assertDanceReferenceStatus(receipt, entry);
    const next = saved({ ...entry, choreographyId: receipt.choreography_id }, raw, signal);
    // Create's status is a historical receipt. Only a fresh GET drives status.
    return read(next, signal);
  };
  return {
    async load(signal: AbortSignal): Promise<DanceReferenceView> {
      current(signal); return store.exclusive(key, async () => {
        current(signal); const raw = store.read(key); if (raw !== null) return read(raw, signal);
        const target = await api.target(locator.accountId, locator.referencePostId, signal); current(signal);
        if (danceReferenceJournalKey(target.scope) !== key) throw new Error("dance_reference_target_changed");
        return { kind: "draft", target };
      });
    },
    async create(target: DanceReferenceTarget, personaId: string, signal: AbortSignal): Promise<DanceReferenceView> {
      target = { ...target, scope: { ...target.scope } }; current(signal);
      return store.exclusive(key, async () => {
        current(signal); const existing = store.read(key); if (existing !== null) return read(existing, signal);
        if (danceReferenceJournalKey(target.scope) !== key || !journalIdentifier(personaId)) throw new Error("dance_reference_target_changed");
        const fresh = await api.target(locator.accountId, locator.referencePostId, signal); current(signal);
        if (danceReferenceIdentity(fresh.scope) !== danceReferenceIdentity(target.scope) || !fresh.playable) throw new Error("dance_reference_target_changed");
        const body: DanceReferenceCommand = { version: "dance-moderated-reference-create-v1", idempotency_key: (options.commandKey ?? (() => crypto.randomUUID()))(),
          community_id: target.scope.communityId, song_post_id: target.scope.postId, reference_post_id: target.scope.referencePostId, persona_id: personaId };
        return dispatch(saved({ ...target.scope, version: 1, bodyJson: JSON.stringify(body), choreographyId: null }, null, signal), signal);
      });
    },
    async retry(signal: AbortSignal): Promise<DanceReferenceView> {
      current(signal); return store.exclusive(key, async () => {
        current(signal); const raw = store.read(key); if (raw === null) throw new Error("dance_reference_original_missing");
        return dispatch(raw, signal);
      });
    },
    async prepareAgain(choreographyId: string, signal: AbortSignal): Promise<DanceReferenceView> {
      current(signal); return store.exclusive(key, async () => {
        current(signal); const raw = store.read(key); if (raw === null) throw new Error("dance_reference_original_missing");
        const { entry, body } = decode(raw, locator);
        // A stale click, concurrent tab or unknown original cannot allocate a
        // new command. Only a fresh status for this exact failed reference can.
        const view = await read(raw, signal);
        if (entry.choreographyId !== choreographyId || view.kind !== "status" || view.reference.status !== "failed") return view;
        const fresh = await api.target(locator.accountId, locator.referencePostId, signal); current(signal);
        if (danceReferenceIdentity(fresh.scope) !== danceReferenceIdentity(entry) || !fresh.playable) throw new Error("dance_reference_target_changed");
        const nextKey = (options.commandKey ?? (() => crypto.randomUUID()))();
        if (nextKey === body.idempotency_key) throw new Error("dance_reference_command_key_reused");
        const nextBody: DanceReferenceCommand = { ...body, idempotency_key: nextKey };
        // Original server receipts remain immutable. Persist this new attempt
        // before POST so a lost reply recovers this exact new key and body.
        return dispatch(saved({ ...entry, bodyJson: JSON.stringify(nextBody), choreographyId: null }, raw, signal), signal);
      });
    },
  };
}
