import { ApiClientError } from "@pirate/api-client";
import type { GuestAuthority, GuestStudyApi, GuestStudySession } from "./guest-study-api.ts";
import {
  createIndexedDbGuestAuthorityStore, createPageGuestAuthorityStore, GuestSelectionStorageError,
  type GuestAuthoritySelection, type GuestAuthorityStore,
  type GuestStartBody, type OriginalGuestStart,
} from "./guest-authority-selection.ts";

type Api = Pick<GuestStudyApi, "discoverAuthority" | "issueBootstrap" | "confirmBootstrap" | "renewAuthority" | "cleanupProof" | "startSession" | "findStartOperation">;
export type GuestStudyStartDraft = Omit<GuestStartBody, "idempotency_key" | "expected_owner_id">;
type Profile = "persistent" | "page_only";
type EntryKind = "new_session" | "recovered_session";
export type GuestStudyStartResult =
  | { status: "started"; entryKind: EntryKind; session: GuestStudySession; credentialId: string; recoveryProfile: Profile }
  | { status: "pending"; message: string; phase: "authority" | "start" | "not_started" | "storage"; originalKey?: string }
  | { status: "unavailable"; message: string; reason: string };
export type GuestAuthorityRenewResult = Exclude<GuestStudyStartResult, { status: "started" }>
  | { status: "ready"; ownerId: string; credentialId: string; recoveryProfile: Profile };
export interface GuestAuthorityLocks {
  exclusive<T>(run: () => Promise<T>): Promise<T>;
}
interface Options {
  api: Api;
  origin: string;
  store?: GuestAuthorityStore;
  locks?: GuestAuthorityLocks;
  createKey?: () => string;
  requestTimeoutMs?: number;
}
interface Route { communityId: string; postId: string; signal?: AbortSignal }
const unavailable = (reason: string): Extract<GuestStudyStartResult, { status: "unavailable" }> => ({ status: "unavailable", reason,
  message: "Guest recovery needs attention before this lesson can continue." });
const pending = (phase: "authority" | "start" | "not_started" | "storage", key?: string): Extract<GuestStudyStartResult, { status: "pending" }> => ({
  status: "pending", phase, message: phase === "not_started"
    ? "This original start was not committed. Retry it deliberately with its saved settings."
    : "This request is unresolved. Keep this page and recover the original request before starting another lesson.",
  ...(key === undefined ? {} : { originalKey: key }),
});
class Refusal extends Error { constructor(readonly reason: string) { super(reason); } }
const samePointer = (a: GuestAuthoritySelection | null, b: GuestAuthoritySelection | null) => JSON.stringify(a) === JSON.stringify(b);
/** Authority lives in host-only server cookies. Storage and locks carry no proof. */
export function createGuestStudyStartCoordinator(options: Options) {
  const { api, origin } = options;
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || parsedOrigin.protocol !== "https:") throw new Refusal("origin_invalid");
  const createKey = options.createKey ?? (() => crypto.randomUUID());
  const timeout = options.requestTimeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30_000) throw new Refusal("timeout_invalid");
  const browserLocks = typeof navigator === "undefined" ? undefined : navigator.locks;
  const locks = options.locks ?? (browserLocks === undefined ? undefined : {
    exclusive: <T>(run: () => Promise<T>) => browserLocks.request("pirate.guest-authority.v1", { mode: "exclusive" }, run),
  });
  const durableStore = options.store ?? (typeof indexedDB === "undefined" ? undefined : createIndexedDbGuestAuthorityStore(origin));
  const profile: Profile = locks !== undefined && durableStore !== undefined ? "persistent" : "page_only";
  const store = profile === "persistent" && durableStore !== undefined ? durableStore : createPageGuestAuthorityStore();
  let selected: string | null = null;
  let pageTail = Promise.resolve();
  const alive = () => {
    if (typeof location !== "undefined" && location.origin !== origin) throw new Refusal("origin_changed");
  };
  async function bounded<T>(call: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    alive();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) throw new Refusal("cancelled_before_request");
      const interruption = new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new Refusal("request_uncertain"));
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        timer = setTimeout(() => controller.abort(), timeout);
      });
      const result = await Promise.race([Promise.resolve().then(() => call(controller.signal)), interruption]);
      alive();
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  async function run<T>(work: () => Promise<T>): Promise<T> {
    alive();
    if (profile === "page_only" && durableStore !== undefined) {
      // An existing persistent selection must not be silently replaced by page-only practice.
      const durable = await durableStore.read();
      if (durable.pointer !== null || durable.issuance !== null || durable.starts.length > 0)
        throw new Refusal("persistent_recovery_requires_coordination");
    }
    if (locks !== undefined) return locks.exclusive(work);
    const next = pageTail.then(work);
    pageTail = next.then(() => undefined, () => undefined);
    return next;
  }
  async function commitPointer(before: GuestAuthoritySelection | null, after: GuestAuthoritySelection) {
    alive();
    await store.update((state) => {
      if (!samePointer(state.pointer, before)) throw new Refusal("selection_changed");
      state.pointer = after;
      state.issuance = null;
    });
    selected = after.credential_id;
  }
  function confirmed(authority: GuestAuthority) {
    const proof = authority.selected;
    if (authority.state !== "confirmed" || proof === null || proof.credential_state !== "confirmed")
      throw new Refusal(authority.state);
    return proof;
  }
  async function authority(signal?: AbortSignal): Promise<GuestAuthoritySelection> {
    const state = await store.read();
    const p = state.pointer;
    const issuance = state.issuance;
    const credential = p?.credential_id ?? issuance?.credentialId;
    let confirmedNow = false;
    let result = await bounded((s) => api.discoverAuthority({ headers: credential == null ? {} : { "x-guest-credential-id": credential },
      ...(p === null ? {} : { query: { expected_owner_id: p.owner_id, previous_credential_id: p.credential_id } }),
    }, s), signal);
    if (p !== null) {
      if (result.pointer_repair !== null) {
        const repair = result.pointer_repair;
        const proof = confirmed(result);
        if (repair.previous_credential_id !== p.credential_id || repair.credential_id !== proof.credential_id
          || repair.owner_id !== proof.owner_id) throw new Refusal("pointer_repair_invalid");
        const changesOwner = repair.owner_id !== p.owner_id;
        if (changesOwner && (p.last_start_key !== null || state.starts.some((r) => r.body.expected_owner_id === p.owner_id)))
          throw new Refusal("uncertain_owner_cannot_change");
        const after = { ...p, owner_id: repair.owner_id, credential_id: repair.credential_id };
        await commitPointer(p, after);
        return after;
      }
      const proof = confirmed(result);
      if (proof.owner_id !== p.owner_id || proof.credential_id !== p.credential_id) throw new Refusal("authority_conflict");
      selected = p.credential_id;
      return p;
    }
    if (result.state === "absent") {
      const key = issuance?.key ?? createKey();
      if (issuance === null) await store.update((current) => {
        if (current.pointer !== null || current.issuance !== null) throw new Refusal("selection_changed");
        current.issuance = { key, ownerId: null, credentialId: null };
      });
      result = await bounded((s) => api.issueBootstrap({ headers: {}, body: { idempotency_key: key } }, s), signal);
    }
    if (result.state === "pending" && result.selected !== null && result.selected.credential_state === "pending_bootstrap") {
      const proof = result.selected;
      await store.update((current) => {
        if (current.pointer !== null) throw new Refusal("selection_changed");
        // Discovery can recover a received cookie after the issue response was lost.
        current.issuance = { key: current.issuance?.key ?? createKey(), ownerId: proof.owner_id, credentialId: proof.credential_id };
      });
      confirmedNow = true;
      result = await bounded((s) => api.confirmBootstrap({ headers: { "x-guest-credential-id": proof.credential_id },
        body: { expected_owner_id: proof.owner_id, credential_id: proof.credential_id } }, s), signal);
    }
    const proof = confirmed(result);
    // A previously captured pending owner cannot be silently switched after a lost confirmation.
    // Canonical empty convergence may change owner only in the actual confirmation response above.
    if (!confirmedNow && issuance?.ownerId != null) {
      if (result.pointer_repair !== null) {
        const repair = result.pointer_repair;
        if (repair.previous_credential_id !== issuance.credentialId || repair.credential_id !== proof.credential_id
          || repair.owner_id !== proof.owner_id) throw new Refusal("pointer_repair_invalid");
        if (proof.owner_id !== issuance.ownerId && state.starts.some((r) => r.body.expected_owner_id === issuance.ownerId))
          throw new Refusal("uncertain_owner_cannot_change");
      } else if (issuance.ownerId !== proof.owner_id || issuance.credentialId !== proof.credential_id) {
        throw new Refusal("authority_conflict");
      }
    }
    const retained = [...state.starts].reverse().find((r) => r.body.expected_owner_id === proof.owner_id
      && (r.state === "submitted" || r.state === "pending_confirmation"))
      ?? [...state.starts].reverse().find((r) => r.body.expected_owner_id === proof.owner_id);
    const after = { origin, owner_id: proof.owner_id, credential_id: proof.credential_id,
      last_start_key: retained?.body.idempotency_key ?? null };
    await commitPointer(null, after);
    return after;
  }
  const matches = (r: OriginalGuestStart, route: Route, p: GuestAuthoritySelection) =>
    r.communityId === route.communityId && r.postId === route.postId && r.body.expected_owner_id === p.owner_id;
  async function saveState(record: OriginalGuestStart, state: OriginalGuestStart["state"]) {
    await store.update((journal) => {
      const saved = journal.starts.find((r) => r.body.idempotency_key === record.body.idempotency_key);
      if (saved === undefined || JSON.stringify(saved.body) !== JSON.stringify(record.body)) throw new Refusal("original_changed");
      if (saved.state !== "completed") saved.state = state;
    });
  }
  async function complete(record: OriginalGuestStart, p: GuestAuthoritySelection, session: GuestStudySession, entryKind: EntryKind): Promise<GuestStudyStartResult> {
    if (session.owner_id !== record.body.expected_owner_id || session.community_id !== record.communityId
      || session.post_id !== record.postId || session.reward_mode !== "practice_only") throw new Refusal("session_correlation_failed");
    await saveState(record, "completed");
    return { status: "started", entryKind, session, credentialId: p.credential_id, recoveryProfile: profile };
  }
  async function lookup(record: OriginalGuestStart, p: GuestAuthoritySelection): Promise<GuestStudyStartResult> {
    try {
      const result = await bounded((s) => api.findStartOperation({ headers: { "x-guest-credential-id": p.credential_id },
        path: { communityId: record.communityId, postId: record.postId, idempotencyKey: record.body.idempotency_key } }, s));
      if (result.state === "completed") return await complete(record, p, result.session, "recovered_session");
      await saveState(record, result.state);
      return pending(result.state === "not_started" ? "not_started" : "start", record.body.idempotency_key);
    } catch {
      // Includes 404, timeout, revoked proof and lease expiry. None proves absence.
      return pending("start", record.body.idempotency_key);
    }
  }
  async function post(record: OriginalGuestStart, p: GuestAuthoritySelection, entryKind: EntryKind, signal?: AbortSignal): Promise<GuestStudyStartResult> {
    try {
      const session = await bounded((s) => api.startSession({ headers: { "x-guest-credential-id": p.credential_id },
        path: { communityId: record.communityId, postId: record.postId }, body: record.body }, s), signal);
      return await complete(record, p, session, entryKind);
    } catch { return lookup(record, p); }
  }
  async function safe<T>(work: () => Promise<T>): Promise<T | Exclude<GuestStudyStartResult, { status: "started" }>> {
    try { return await run(work); }
    catch (error) {
      if (error instanceof Refusal) return unavailable(error.reason);
      if (error instanceof GuestSelectionStorageError) return pending("storage");
      if (error instanceof ApiClientError) {
        const reason = error.details?.reason_code;
        if (reason === "issuance_requires_restart" || reason === "guest_authority_conflict" || reason === "guest_credential_cleanup_required"
          || reason === "guest_learning_lease_expired" || reason === "guest_recovery_required") return unavailable(reason);
      }
      return pending("authority");
    }
  }
  return {
    selectedCredentialId: () => selected,
    start: (input: Route & { draft: GuestStudyStartDraft }): Promise<GuestStudyStartResult> => safe(async () => {
      if (input.draft.reward_mode !== "practice_only" || input.draft.reward_preview_terms_hash !== null
        || input.draft.disclosure.accepted !== true) return unavailable("practice_consent_required");
      const p = await authority(input.signal);
      const journal = await store.read();
      const previous = [...journal.starts].reverse().find((r) => matches(r, input, p));
      if (previous !== undefined) return lookup(previous, p);
      const unresolved = journal.starts.find((r) => r.body.expected_owner_id === p.owner_id
        && (r.state === "submitted" || r.state === "pending_confirmation"));
      if (unresolved !== undefined) return pending("start", unresolved.body.idempotency_key);
      if (input.signal?.aborted) return unavailable("cancelled_before_start");
      const record: OriginalGuestStart = { communityId: input.communityId, postId: input.postId, state: "submitted",
        body: structuredClone({ ...input.draft, expected_owner_id: p.owner_id, idempotency_key: createKey() }) };
      // Commit exact body/key AND pointer BEFORE sending any start request.
      await store.update((state) => {
        if (!samePointer(state.pointer, p) || state.starts.some((r) => matches(r, input, p))) throw new Refusal("selection_changed");
        state.starts.push(record);
        state.pointer = { ...p, last_start_key: record.body.idempotency_key };
      });
      return post(record, p, "new_session", input.signal);
    }),
    resume: (input: Route): Promise<GuestStudyStartResult> => safe(async () => {
      const saved = await store.read();
      if (saved.pointer === null) return unavailable("no_saved_selection");
      const p = await authority(input.signal);
      const record = [...saved.starts].reverse().find((r) => matches(r, input, p));
      return record === undefined ? unavailable("no_saved_start") : lookup(record, p);
    }),
    retryOriginal: (input: Route): Promise<GuestStudyStartResult> => safe(async () => {
      const p = await authority(input.signal);
      const record = [...(await store.read()).starts].reverse().find((r) => matches(r, input, p));
      if (record === undefined || record.state !== "not_started") return unavailable("original_not_known_aborted");
      await saveState(record, "submitted");
      return post(record, p, "recovered_session", input.signal);
    }),
    renew: (signal?: AbortSignal): Promise<GuestAuthorityRenewResult> => safe(async () => {
      const p = (await store.read()).pointer;
      if (p === null) return unavailable("no_saved_selection");
      const result = await bounded((s) => api.renewAuthority({ headers: { "x-guest-credential-id": p.credential_id },
        body: { expected_owner_id: p.owner_id } }, s), signal);
      const proof = confirmed(result);
      if (proof.owner_id !== p.owner_id || proof.credential_id !== p.credential_id) return unavailable("authority_conflict");
      selected = p.credential_id;
      return { status: "ready" as const, ownerId: p.owner_id, credentialId: p.credential_id, recoveryProfile: profile };
    }),
    /** Explicit user action; one server-proved bounded pass, never selected credential. */
    cleanupUnselected: (candidateIds: readonly string[], signal?: AbortSignal): Promise<GuestStudyStartResult> => safe(async () => {
      if (candidateIds.length > 16 || new Set(candidateIds).size !== candidateIds.length) return unavailable("cleanup_bound");
      const p = (await store.read()).pointer;
      if (p !== null && candidateIds.includes(p.credential_id)) return unavailable("selected_cleanup_forbidden");
      const headers = p === null ? {} : { "x-guest-credential-id": p.credential_id };
      const metadata = await bounded((s) => api.cleanupProof({ headers, body: { selected_credential_id: p?.credential_id ?? null,
        candidate_credential_ids: [], candidate_intent_ids: [] } }, s), signal);
      if (!candidateIds.every((id) => metadata.authority.proved_credentials.some((proof) => proof.credential_id === id)))
        return unavailable("unproved_cleanup_candidate");
      await bounded((s) => api.cleanupProof({ headers, body: { selected_credential_id: p?.credential_id ?? null,
        candidate_credential_ids: candidateIds, candidate_intent_ids: [] } }, s), signal);
      return pending("authority");
    }),
  };
}
