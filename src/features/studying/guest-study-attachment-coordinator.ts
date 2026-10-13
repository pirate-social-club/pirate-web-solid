import type { GuestAuthorityStore } from "./guest-authority-selection";
import { createIndexedDbGuestAuthorityStore } from "./guest-authority-selection";
import type { GuestStudyApi } from "./guest-study-api";
import type { GuestStudyAccountingApi, GuestAttachmentBinding, GuestAttachmentPrepared } from "./guest-study-accounting-api";
import type { GuestAuthorityLocks } from "./guest-study-start-coordinator";

export interface OriginalGuestAttachment {
  origin: string; ownerId: string; credentialId: string; key: string;
  intent: Awaited<ReturnType<GuestStudyApi["createAttachmentIntent"]>> | null;
  target: GuestAttachmentPrepared | null;
  /** Acknowledged in the same metadata transaction before the first confirm POST. */
  confirmationSubmitted: boolean;
  binding: GuestAttachmentBinding | null;
}
export type GuestAttachmentState = { status: "pending" | "unavailable" }
  | { status: "awaiting_account"; intentId: string }
  | { status: "awaiting_confirmation"; target: GuestAttachmentPrepared }
  | { status: "bound"; binding: GuestAttachmentBinding };
interface Options {
  origin: string; ownerId: string; credentialId: () => string | null;
  guest: Pick<GuestStudyApi, "createAttachmentIntent">; accounting: Pick<GuestStudyAccountingApi, "prepareAttachment" | "confirmAttachment" | "getAttachment">;
  store?: GuestAuthorityStore; locks?: GuestAuthorityLocks; key?: () => string; timeoutMs?: number;
}
/** One initiating-origin ceremony. Nonsecret metadata only; proof and nonce stay HttpOnly. */
export function createGuestStudyAttachmentCoordinator(options: Options) {
  if (new URL(options.origin).origin !== options.origin || !options.origin.startsWith("https:")) throw new Error("Initiating origin required");
  const store = options.store ?? (typeof indexedDB === "undefined" ? undefined : createIndexedDbGuestAuthorityStore(options.origin));
  const locks = options.locks ?? (typeof navigator === "undefined" || navigator.locks === undefined ? undefined : {
    exclusive: <T>(work: () => Promise<T>) => navigator.locks.request("pirate.guest-authority.v1", { mode: "exclusive" }, work),
  });
  const timeout = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30_000) throw new Error("Invalid deadline");
  const assertOrigin = () => {
    if (typeof location !== "undefined" && location.origin !== options.origin) throw new Error("Origin changed");
  };
  const selectedProof = () => {
    assertOrigin();
    const credential = options.credentialId();
    if (credential === null) throw new Error("Selected guest proof required");
    return credential;
  };
  async function bounded<T>(call: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (controller.signal.aborted) throw new Error("Cancelled");
      const interrupted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Unresolved original ceremony")), { once: true });
        timer = setTimeout(cancel, timeout);
      });
      const result = await Promise.race([Promise.resolve().then(() => call(controller.signal)), interrupted]);
      assertOrigin(); return result;
    } finally { if (timer !== undefined) clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  }
  function bindingMatches(record: OriginalGuestAttachment, binding: GuestAttachmentBinding): boolean {
    return record.intent !== null && record.target !== null && record.confirmationSubmitted
      && binding.attachment_id === record.intent.intent_id && record.target.intent_id === record.intent.intent_id
      && binding.owner_id === record.ownerId && binding.owner_id === options.ownerId
      && binding.account_id === record.target.account_confirmation.account_id && binding.state === "bound";
  }
  async function saveBinding(s: GuestAuthorityStore, record: OriginalGuestAttachment, binding: GuestAttachmentBinding) {
    if (!bindingMatches(record, binding)) throw new Error("Original binding mismatch");
    await s.update(j => {
      if (j.attachment?.key !== record.key || !bindingMatches(j.attachment, binding)) throw new Error("Original changed");
      j.attachment.binding = binding;
    });
  }
  async function run(work: (credential: string, store: GuestAuthorityStore) => Promise<GuestAttachmentState>, signal?: AbortSignal): Promise<GuestAttachmentState> {
    if (store === undefined || locks === undefined) return { status: "unavailable" };
    try { return await locks.exclusive(async () => {
      assertOrigin();
      const journal = await store.read(), original = journal.attachment;
      if (original !== undefined && (original.origin !== options.origin || original.ownerId !== options.ownerId)) throw new Error("Original scope changed");
      if (original?.confirmationSubmitted) {
        if (original.intent === null || original.target === null) throw new Error("Original confirmation damaged");
        const originalIntentId = original.intent.intent_id;
        let recovered: GuestAttachmentBinding | undefined;
        // Account-only natural replay precedes ALL Guest selected-proof/pointer gates.
        // A successful original confirmation may already have revoked Guest proof.
        try { recovered = await bounded(sig => options.accounting.getAttachment({ path: { id: originalIntentId } }, sig), signal); }
        catch { /* Timeout/404/401 are unresolved; never absence or permission to retarget. */ }
        if (recovered !== undefined) {
          await saveBinding(store, original, recovered);
          return { status: "bound", binding: recovered };
        }
        if (original.binding !== null) return { status: "pending" };
        // If the original remains unknown, explicit confirmation may retry ONLY
        // its identical stored request with live Guest proof. No new target/key.
      }
      const credential = selectedProof();
      if (journal.pointer?.origin !== options.origin || journal.pointer.owner_id !== options.ownerId || journal.pointer.credential_id !== credential)
        return { status: "pending" };
      return work(credential, store);
    }); }
    catch { return { status: "pending" }; }
  }
  function check(record: OriginalGuestAttachment, credential: string): void {
    if (record.origin !== options.origin || record.ownerId !== options.ownerId || record.credentialId !== credential) throw new Error("Original authority changed");
  }
  return {
    begin: (signal?: AbortSignal) => run(async (credential, s) => {
      let record = (await s.read()).attachment;
      if (record === undefined) {
        const original: OriginalGuestAttachment = { origin: options.origin, ownerId: options.ownerId, credentialId: credential,
          key: (options.key ?? (() => crypto.randomUUID()))(), intent: null, target: null, confirmationSubmitted: false, binding: null };
        await s.update(j => {
          if (j.pointer?.owner_id !== options.ownerId || j.pointer.credential_id !== credential || j.attachment !== undefined) throw new Error("Authority changed");
          j.attachment = original;
        });
        record = original;
      }
      check(record, credential);
      if (record.binding !== null) return { status: "bound", binding: record.binding };
      if (record.intent === null) {
        const originalKey = record.key;
        const intent = await bounded(sig => options.guest.createAttachmentIntent({ headers: { "x-guest-credential-id": credential }, body: { expected_owner_id: options.ownerId, idempotency_key: originalKey } }, sig), signal);
        await s.update(j => { if (j.attachment?.key !== originalKey) throw new Error("Original changed"); j.attachment.intent = intent; });
        record = { ...record, intent };
      }
      if (record.target !== null) return { status: "awaiting_confirmation", target: record.target };
      if (record.intent === null) throw new Error("Original intent unresolved");
      return { status: "awaiting_account", intentId: record.intent.intent_id };
    }, signal),
    prepare: (signal?: AbortSignal) => run(async (credential, s) => {
      const record = (await s.read()).attachment;
      if (record === undefined || record.intent === null) return { status: "unavailable" };
      check(record, credential);
      if (record.binding !== null) return { status: "bound", binding: record.binding };
      // Once confirm was sent, never prepare a new target behind an unknown COMMIT.
      if (record.confirmationSubmitted && record.target !== null) return { status: "awaiting_confirmation", target: record.target };
      const originalIntent = record.intent;
      const target = await bounded(sig => options.accounting.prepareAttachment({ path: { id: originalIntent.intent_id }, headers: { "x-guest-credential-id": credential } }, sig), signal);
      if (target.intent_id !== record.intent.intent_id) throw new Error("Intent mismatch");
      await s.update(j => { if (j.attachment?.key !== record.key || j.attachment.confirmationSubmitted) throw new Error("Original changed"); j.attachment.target = target; });
      return { status: "awaiting_confirmation", target };
    }, signal),
    confirm: (accepted: GuestAttachmentPrepared, signal?: AbortSignal) => run(async (credential, s) => {
      const record = (await s.read()).attachment;
      if (record === undefined || record.intent === null || record.target === null) return { status: "unavailable" };
      check(record, credential);
      if (record.binding !== null) return { status: "bound", binding: record.binding };
      const target = record.target;
      if (accepted.intent_id !== target.intent_id || accepted.target_revision !== target.target_revision
        || accepted.account_confirmation.account_id !== target.account_confirmation.account_id) return { status: "unavailable" };
      await s.update(j => {
        if (j.attachment?.key !== record.key || j.attachment.target?.target_revision !== target.target_revision
          || j.attachment.target.account_confirmation.account_id !== target.account_confirmation.account_id) throw new Error("Original changed");
        j.attachment.confirmationSubmitted = true;
      });
      const binding = await bounded(sig => options.accounting.confirmAttachment({ path: { id: target.intent_id }, headers: { "x-guest-credential-id": credential },
        body: { target_revision: target.target_revision, expected_account_id: target.account_confirmation.account_id } }, sig), signal);
      await saveBinding(s, { ...record, confirmationSubmitted: true }, binding);
      return { status: "bound", binding };
    }, signal),
  };
}
