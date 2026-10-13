import type { GuestStudyAnswerResult, GuestStudySession } from "./guest-study-api.ts";
import {
  createIndexedDbGuestStudyAnswerStorage, createPageGuestStudyAnswerStorage,
  GuestStudyAnswerJournalError, guestAnswerScopeOf, sameGuestAnswerMarker, sameGuestAnswerScope,
  validGuestAnswerMarker, validGuestAnswerScope,
  type GuestStudyAnswerMarker, type GuestStudyAnswerScope, type GuestStudyAnswerStorage,
} from "./guest-study-answer-storage.ts";
export { GuestStudyAnswerJournalError } from "./guest-study-answer-storage.ts";
export type { GuestStudyAnswerMarker, GuestStudyAnswerScope, GuestStudyAnswerStorage } from "./guest-study-answer-storage.ts";

export interface GuestStudyAnswerLocks { exclusive<T>(work: () => Promise<T>): Promise<T>; }
export interface GuestStudyAnswerJournal {
  readonly profile: "persistent" | "page_only";
  /** ONLY the coordinator's new locally initiated, acknowledged start. Never a recovered start. */
  registerNewSession(scope: GuestStudyAnswerScope, start: { readonly entryKind: "new_session"; readonly session: GuestStudySession }): Promise<void>;
  /** Missing/damaged inventory is unavailable, not a clean recovered session. */
  read(scope: GuestStudyAnswerScope): Promise<GuestStudyAnswerMarker | null>;
  /** Keep this exact closure for a same-page continuation; it owns the original live payload. */
  submit(marker: GuestStudyAnswerMarker, dispatchOriginal: (signal: AbortSignal) => Promise<GuestStudyAnswerResult>): Promise<GuestStudyAnswerResult>;
}
interface LiveSubmission {
  readonly marker: GuestStudyAnswerMarker;
  ownsMarker: boolean;
  accepted?: GuestStudyAnswerResult;
  completed?: GuestStudyAnswerResult;
  inFlight?: Promise<GuestStudyAnswerResult>;
}
function matchesSession(scope: GuestStudyAnswerScope, session: GuestStudySession): boolean {
  return session.owner_id === scope.ownerId && session.community_id === scope.communityId && session.session_id === scope.sessionId;
}
function browserLocks(): GuestStudyAnswerLocks | undefined {
  if (typeof navigator === "undefined" || navigator.locks === undefined) return undefined;
  return { exclusive: async <T>(work: () => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      return await navigator.locks.request<Promise<T>>("pirate.guest-authority.v1", { mode: "exclusive", signal: controller.signal }, async () => {
        clearTimeout(timer); return work();
      });
    } catch (error) {
      if (controller.signal.aborted) throw new GuestStudyAnswerJournalError("unavailable");
      throw error;
    } finally { clearTimeout(timer); }
  } };
}
export function createGuestStudyAnswerJournal(options: {
  readonly origin: string;
  readonly storage?: GuestStudyAnswerStorage;
  readonly locks?: GuestStudyAnswerLocks;
  readonly profile?: "persistent" | "page_only";
  readonly dispatchTimeoutMs?: number;
}): GuestStudyAnswerJournal {
  const storage = options.storage ?? createIndexedDbGuestStudyAnswerStorage(options.origin);
  const locks = options.locks ?? browserLocks();
  const dispatchTimeout = options.dispatchTimeoutMs ?? 10_000;
  if (!Number.isInteger(dispatchTimeout) || dispatchTimeout < 1 || dispatchTimeout > 30_000)
    throw new GuestStudyAnswerJournalError("unavailable");
  const boundedDispatch = async (dispatch: (signal: AbortSignal) => Promise<GuestStudyAnswerResult>) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new GuestStudyAnswerJournalError("dispatch_uncertain"));
        controller.abort();
      }, dispatchTimeout);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => dispatch(controller.signal)), deadline]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  };
  const live = new WeakMap<(signal: AbortSignal) => Promise<GuestStudyAnswerResult>, LiveSubmission>();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    if (locks === undefined) return Promise.reject(new GuestStudyAnswerJournalError("unavailable"));
    return locks.exclusive(work);
  };
  const scopeValid = (scope: GuestStudyAnswerScope) => {
    if (!validGuestAnswerScope(scope) || scope.origin !== options.origin) throw new GuestStudyAnswerJournalError("damaged");
  };
  const ownedRead = async (scope: GuestStudyAnswerScope) => {
    scopeValid(scope);
    const inventory = await storage.read(scope);
    if (inventory === null) throw new GuestStudyAnswerJournalError("inventory_missing");
    if (!sameGuestAnswerScope(inventory.scope, scope)
      || (inventory.pending !== null && (!validGuestAnswerMarker(inventory.pending) || !sameGuestAnswerScope(inventory.pending, scope))))
      throw new GuestStudyAnswerJournalError("damaged");
    return inventory.pending;
  };
  return {
    profile: options.profile ?? "persistent",
    registerNewSession: (scope, start) => exclusive(async () => {
      scopeValid(scope);
      if (start.entryKind !== "new_session" || !matchesSession(scope, start.session)) throw new GuestStudyAnswerJournalError("not_original");
      await storage.register(scope);
    }),
    read: (scope) => exclusive(async () => structuredClone(await ownedRead(scope))),
    submit(marker, dispatchOriginal) {
      if (!validGuestAnswerMarker(marker)) return Promise.reject(new GuestStudyAnswerJournalError("damaged"));
      let context = live.get(dispatchOriginal);
      if (context !== undefined && !sameGuestAnswerMarker(context.marker, marker)) return Promise.reject(new GuestStudyAnswerJournalError("not_original"));
      if (context === undefined) {
        context = { marker: Object.freeze(structuredClone(marker)), ownsMarker: false };
        live.set(dispatchOriginal, context);
      }
      if (context.completed !== undefined) return Promise.resolve(context.completed);
      if (context.inFlight !== undefined) return context.inFlight;
      const original = context;
      const running = exclusive(async () => {
        const scope = guestAnswerScopeOf(original.marker), pending = await ownedRead(scope);
        if (pending !== null) {
          if (!original.ownsMarker || !sameGuestAnswerMarker(pending, original.marker)) throw new GuestStudyAnswerJournalError("pending");
        } else if (original.ownsMarker && original.accepted === undefined) {
          throw new GuestStudyAnswerJournalError("inventory_missing");
        } else if (!original.ownsMarker) {
          await storage.mark(original.marker); // COMMIT acknowledgment must precede POST.
          original.ownsMarker = true;
        }
        if (original.accepted === undefined) {
          const result = await boundedDispatch(dispatchOriginal);
          if (!matchesSession(scope, result.session) || result.session_item_id !== original.marker.sessionItemId
            || result.attempt_number !== original.marker.attemptNumber
            || !result.session.items.some(item => item.session_item_id === original.marker.sessionItemId))
            throw new GuestStudyAnswerJournalError("result_mismatch");
          // This is the generated-validated response of this original dispatch;
          // a generic session GET has no key and cannot confirm this marker.
          original.accepted = result;
        }
        await storage.clearMatching(original.marker);
        original.completed = original.accepted;
        return original.accepted;
      });
      const settled = running.finally(() => { original.inFlight = undefined; });
      original.inFlight = settled;
      return settled;
    },
  };
}

/** Local serial practice coordination only; do not claim persistence or cross-tab ownership. */
export function createPageGuestStudyAnswerJournal(origin: string): GuestStudyAnswerJournal {
  let tail: Promise<unknown> = Promise.resolve();
  const locks: GuestStudyAnswerLocks = { exclusive: work => {
    const run = tail.then(work); tail = run.then(() => undefined, () => undefined); return run;
  } };
  return createGuestStudyAnswerJournal({ origin, storage: createPageGuestStudyAnswerStorage(origin), locks, profile: "page_only" });
}
