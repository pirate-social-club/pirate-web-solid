import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events.ts";
import { createDancePreparationApi, type DanceCaptureContext, type DanceSession } from "./dance-preparation-api.ts";
import { createDancePreparationJournal, danceConsentBody, danceCreateBody, danceJournalKey, type DanceJournalScope, type DanceJournalStore, type DancePreparationEntry } from "./dance-preparation-journal.ts";

type Api = Pick<ReturnType<typeof createDancePreparationApi>, "create" | "consent" | "latest" | "session" | "context">;
export type DancePreparationView =
  | { readonly kind: "objectives"; readonly session: DanceSession; readonly context: DanceCaptureContext }
  | { readonly kind: "capture_ready"; readonly session: DanceSession; readonly context: DanceCaptureContext; readonly assertCurrent: () => void }
  | { readonly kind: "upload_recovery" | "terminal" | "expired"; readonly session: DanceSession; readonly context: null };

/** Preparation and original-command recovery. UI Start supplies the terms hash
 * of the objectives it actually displayed; no implicit funded acceptance. */
export function createDancePreparationController(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly store: DanceJournalStore;
  readonly api?: Api;
  readonly commandKey?: () => string;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope);
  const authority = captureSessionAuthority(), api = options.api ?? createDancePreparationApi();
  const journal = createDancePreparationJournal({ scope, currentScope: options.currentScope, store: options.store });
  const newKey = options.commandKey ?? (() => crypto.randomUUID()), now = options.nowMs ?? Date.now;
  let generation = 0;
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentScope();
    if (!isCurrentSessionAuthority(authority) || !selected || danceJournalKey(selected) !== key) throw new Error("dance_preparation_scope_changed");
  };
  const begin = (signal: AbortSignal) => {
    current(signal); const selected = ++generation;
    return () => { current(signal); if (generation !== selected) throw new Error("dance_preparation_superseded"); };
  };
  const matches = (entry: DancePreparationEntry, session: DanceSession) => {
    if (session.session_id !== entry.sessionId || session.terms_hash !== entry.termsHash || session.policy_hash !== entry.policyHash
      || session.community_id !== scope.communityId || session.song_post_id !== scope.postId || session.choreography_id !== scope.choreographyId
      || session.choreography_revision !== scope.choreographyRevision) throw new Error("dance_preparation_target_changed");
  };
  const reconcile = async (entry: DancePreparationEntry, signal: AbortSignal, guard: () => void): Promise<DancePreparationView> => {
    guard();
    if (entry.sessionId === null) throw new Error("dance_preparation_original_required");
    const session = await api.session(scope, entry.sessionId, signal); guard(); matches(entry, session);
    if (session.state === "terminal") return { kind: "terminal", session, context: null };
    if (session.state === "awaiting_upload" || session.state === "uploaded") return { kind: "upload_recovery", session, context: null };
    const context = await api.context(scope, entry.sessionId, signal); guard(); matches(entry, context.session);
    if (context.persona_id !== scope.personaId) throw new Error("dance_preparation_target_changed");
    const latest = context.session;
    if (latest.state === "terminal") return { kind: "terminal", session: latest, context: null };
    if (latest.state === "awaiting_upload" || latest.state === "uploaded") return { kind: "upload_recovery", session: latest, context: null };
    const time = now();
    if (!Number.isFinite(time) || time >= latest.expires_at_ms) return { kind: "expired", session: latest, context: null };
    return { kind: "objectives", session: latest, context };
  };
  return {
    async prepare(expectedPolicyHash: string, signal: AbortSignal): Promise<DancePreparationView> {
      const guard = begin(signal);
      return journal.exclusive(async handle => {
        guard(); let entry = handle.read();
        if (entry === null) {
          const latest = await api.latest(scope, { choreographyId: scope.choreographyId, revision: scope.choreographyRevision }, signal); guard();
          if (latest.active_session_id !== null) {
            const context = await api.context(scope, latest.active_session_id, signal); guard();
            entry = handle.adopt(context);
          } else {
            entry = handle.initialize({ version: "dance-moderated-intake-v1", operation: "create", idempotency_key: newKey(),
              community_id: scope.communityId, song_post_id: scope.postId, persona_id: scope.personaId,
              choreography_id: scope.choreographyId, choreography_revision: scope.choreographyRevision, expected_policy_hash: expectedPolicyHash });
          }
        }
        if (entry.sessionId === null) {
          const original = danceCreateBody(entry);
          if (original === null) throw new Error("dance_preparation_original_required");
          const receipt = await api.create(scope, original, signal); guard();
          entry = handle.acknowledgeCreate(receipt);
        }
        return reconcile(entry, signal, guard);
      });
    },
    async start(acceptedTermsHash: string, signal: AbortSignal): Promise<DancePreparationView> {
      const guard = begin(signal);
      return journal.exclusive(async handle => {
        guard(); let entry = handle.read();
        if (entry === null) throw new Error("dance_preparation_original_required");
        const displayed = await reconcile(entry, signal, guard); guard();
        if (displayed.kind !== "objectives") return displayed;
        if (displayed.session.terms_hash !== acceptedTermsHash) throw new Error("dance_preparation_objectives_changed");
        let consent = danceConsentBody(entry);
        if (consent === null) {
          const session = displayed.session;
          entry = handle.prepareConsent({ version: "dance-moderated-intake-v1", operation: "consent", idempotency_key: newKey(),
            community_id: scope.communityId, session_id: session.session_id, terms_hash: session.terms_hash,
            consent_version: session.consent_version, consent_hash: session.consent_hash, retention_hash: session.retention_hash });
          consent = danceConsentBody(entry);
        }
        if (consent === null) throw new Error("dance_preparation_original_required");
        if (entry.consentReceiptId === null) {
          const receipt = await api.consent(scope, consent, signal); guard();
          entry = handle.acknowledgeConsent(receipt);
        }
        const fresh = await reconcile(entry, signal, guard); guard();
        if (fresh.kind !== "objectives") return fresh;
        if (fresh.session.state !== "consented" || entry.consentReceiptId === null) throw new Error("dance_preparation_consent_unconfirmed");
        const lease = handle.claimCapture(entry);
        const expiresAtMs = fresh.session.expires_at_ms;
        const assertCurrent = () => {
          guard();
          const retained = journal.read();
          if (retained === null || retained.revision !== lease.revision || retained.sessionId !== lease.sessionId
            || retained.termsHash !== lease.termsHash || retained.policyHash !== lease.policyHash || retained.consentReceiptId !== lease.consentReceiptId) throw new Error("dance_preparation_capture_superseded");
          const time = now();
          if (!Number.isFinite(time) || time >= expiresAtMs) throw new Error("dance_preparation_capture_expired");
        };
        assertCurrent();
        return { kind: "capture_ready", session: fresh.session, context: fresh.context, assertCurrent };
      });
    },
    async closeTerminal(signal: AbortSignal): Promise<void> {
      const guard = begin(signal);
      return journal.exclusive(async handle => {
        guard(); const entry = handle.read();
        if (entry === null) return;
        if (entry.sessionId === null) throw new Error("dance_preparation_original_required");
        const session = await api.session(scope, entry.sessionId, signal); guard();
        handle.closeTerminal(session);
      });
    },
  };
}
