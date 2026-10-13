import { resolveSession } from "../../api/session";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { createIndexedDbGuestAuthorityStore, type GuestAuthorityStore } from "./guest-authority-selection";
import { sameGuestRewardTerms, isGuestRewardTerms, type GuestRewardTerms } from "./guest-study-reward-model";
import type { OriginalOwnerStudyStart, OwnerStudyStartBody } from "./owner-study-journal";
export type OwnerStudySession = Awaited<ReturnType<OwnerStudyFinancialApi["startSession"]>>;
export type OwnerStudyStartResult = { status: "started"; result: OwnerStudySession; originalKey: string;
  namespaceAccountId: string; disclosure: { version: string; text: string }; entryKind: "new_session" | "recovered_session"; readOnlyRecovery: boolean }
  | { status: "pending" | "unavailable"; message: string };
export interface OwnerStudyLocks { exclusive<T>(work: () => Promise<T>): Promise<T> }
export function createOwnerStudyLocks(origin: string): OwnerStudyLocks {
  return { exclusive: async <T>(work: () => Promise<T>): Promise<T> => {
    if (typeof navigator === "undefined" || navigator.locks === undefined) throw new Error("Browser coordination unavailable");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try { return await navigator.locks.request<Promise<T>>("pirate.guest-authority.v1", { mode: "exclusive", signal: controller.signal }, async () => {
      clearTimeout(timer); return work();
    }); } finally { clearTimeout(timer); }
  } };
}
export async function boundedOwnerRequest<A>(run: (signal: AbortSignal) => Promise<A>, timeout = 10000): Promise<A> {
  const controller = new AbortController(); let expired = false;
  const request = Promise.resolve().then(() => run(controller.signal));
  void request.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    expired = true; controller.abort(); reject(new Error("Original request unresolved"));
  }, timeout); });
  try { const value = await Promise.race([request, deadline]); if (expired) throw new Error("Original request unresolved"); return value; }
  finally { clearTimeout(timer); }
}
export function ownerStudyBindingValid(value: OwnerStudySession): boolean {
  const s = value.session, t = value.reward_terms, p = value.participation;
  return isGuestRewardTerms(t) && s.community_id === t.community_id && s.post_id === t.post_id
    && s.audio_revision === t.audio_revision && s.lyrics_revision === t.lyrics_revision
    && s.qualification_policy_revision === t.qualification_policy_version_id && p.state !== "practice_only"
    && (p.state !== "admitted" || (s.status === "completed" && s.progress.first_pass_correct >= s.progress.required_correct
      && p.original_drawing_id === t.original_drawing_id && p.pool_leg_id === t.pool_leg_id));
}
export function createOwnerStudyStartCoordinator(options: { origin: string;
  api: Pick<OwnerStudyFinancialApi, "startSession" | "findStartOperation">;
  store?: GuestAuthorityStore; locks?: OwnerStudyLocks; createKey?: () => string; verifyAccount?: () => Promise<string | null> }) {
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.protocol !== "https:") throw new Error("Initiating origin required");
  const store = options.store ?? createIndexedDbGuestAuthorityStore(options.origin);
  const locks = options.locks ?? createOwnerStudyLocks(options.origin);
  const pending = (): OwnerStudyStartResult => ({ status: "pending", message: "Recover the original request before starting another lesson. Its drawing and settings remain unchanged." });
  const alive = () => { if (typeof location !== "undefined" && location.origin !== options.origin) throw new Error("Initiating origin changed"); };
  const verify = async (accountId: string) => {
    const current = await boundedOwnerRequest(async () => {
      if (options.verifyAccount !== undefined) return options.verifyAccount();
      const account = await resolveSession(); return account === "anonymous" ? null : account.userId;
    });
    if (current !== accountId) throw new Error("Original Account scope unavailable");
  };
  const change = async (saved: OriginalOwnerStudyStart, mutate: (record: OriginalOwnerStudyStart) => void) => store.update(j => {
    const r = j.ownerStarts?.find(v => v.accountId === saved.accountId && v.body.idempotency_key === saved.body.idempotency_key);
    if (r === undefined || JSON.stringify(r.body) !== JSON.stringify(saved.body) || !sameGuestRewardTerms(r.acceptedTerms, saved.acceptedTerms)) throw new Error("Original journal changed");
    mutate(r);
  });
  const accept = async (saved: OriginalOwnerStudyStart, result: OwnerStudySession, fresh: boolean): Promise<OwnerStudyStartResult> => {
    await verify(saved.accountId);
    if (!ownerStudyBindingValid(result) || !sameGuestRewardTerms(saved.acceptedTerms, result.reward_terms)
      || result.session.persona_id !== saved.body.persona_id || result.session.community_id !== saved.communityId || result.session.post_id !== saved.postId
      || result.session.languages.target_language !== saved.body.target_language || result.session.learner_band !== saved.body.learner_band
      || result.session.timezone !== saved.body.timezone || (saved.sessionId !== null && saved.sessionId !== result.session.session_id)) throw new Error("Original session differs");
    await change(saved, r => { r.state = "completed"; r.sessionId = result.session.session_id;
      if (fresh && r.inventory === null) r.inventory = { initialized: true, pending: null }; });
    const latest = (await store.read()).ownerStarts?.find(r => r.accountId === saved.accountId && r.body.idempotency_key === saved.body.idempotency_key);
    return { status: "started", result, originalKey: saved.body.idempotency_key, namespaceAccountId: saved.accountId, disclosure: { version: saved.body.disclosure.version, text: saved.disclosureText },
      entryKind: fresh ? "new_session" : "recovered_session", readOnlyRecovery: latest?.inventory?.initialized !== true || latest.inventory.pending !== null };
  };
  const reconcile = async (saved: OriginalOwnerStudyStart): Promise<OwnerStudyStartResult> => {
    await verify(saved.accountId);
    const found = await boundedOwnerRequest(signal => options.api.findStartOperation({ path: {
      communityId: saved.communityId, postId: saved.postId, idempotencyKey: saved.body.idempotency_key,
    } }, signal));
    if (found.state === "completed") return accept(saved, found.result, false);
    await change(saved, r => { r.state = found.state; });
    return pending(); // not_started permits deliberate same original body/key retry only.
  };
  return {
    store, locks,
    async start(input: { accountId: string; communityId: string; postId: string; acceptedTerms: GuestRewardTerms; disclosureText: string;
      draft: Omit<OwnerStudyStartBody, "idempotency_key"> }): Promise<OwnerStudyStartResult> {
      try { alive(); return await locks.exclusive(async () => {
        alive(); await verify(input.accountId); const journal = await store.read();
        const existing = journal.ownerStarts?.find(r => r.accountId === input.accountId && r.communityId === input.communityId && r.postId === input.postId);
        if (existing !== undefined) return reconcile(existing);
        if (!isGuestRewardTerms(input.acceptedTerms) || input.acceptedTerms.community_id !== input.communityId
          || input.acceptedTerms.post_id !== input.postId || input.acceptedTerms.disclosure_version !== input.draft.disclosure.version
          || input.draft.disclosure.accepted !== true) throw new Error("Explicit terms/disclosure required");
        const body = { ...structuredClone(input.draft), idempotency_key: options.createKey?.() ?? crypto.randomUUID() };
        const saved: OriginalOwnerStudyStart = { accountId: input.accountId, communityId: input.communityId, postId: input.postId,
          body, acceptedTerms: structuredClone(input.acceptedTerms), disclosureText: input.disclosureText, state: "submitted", sessionId: null, inventory: null };
        await store.update(j => { (j.ownerStarts ??= []).push(saved); }); // Acknowledged durable body/key BEFORE any POST.
        try { const result = await boundedOwnerRequest(signal => options.api.startSession({ path: {
          communityId: saved.communityId, postId: saved.postId,
        }, body: saved.body }, signal)); return await accept(saved, result, true); }
        catch { await change(saved, r => { r.state = "pending_confirmation"; }); return reconcile(saved); }
      }); } catch { return pending(); }
    },
    async resume(accountId: string, communityId: string, postId: string): Promise<OwnerStudyStartResult> {
      try { alive(); return await locks.exclusive(async () => {
        const saved = (await store.read()).ownerStarts?.find(r => r.accountId === accountId && r.communityId === communityId && r.postId === postId);
        return saved === undefined ? pending() : reconcile(saved);
      }); } catch { return pending(); }
    },
    async retryOriginal(accountId: string, communityId: string, postId: string): Promise<OwnerStudyStartResult> {
      try { alive(); return await locks.exclusive(async () => {
        const saved = (await store.read()).ownerStarts?.find(r => r.accountId === accountId && r.communityId === communityId && r.postId === postId);
        if (saved === undefined) return pending();
        const first = await reconcile(saved);
        if (first.status === "started") return first;
        const current = (await store.read()).ownerStarts?.find(r => r.accountId === saved.accountId && r.body.idempotency_key === saved.body.idempotency_key);
        if (current?.state !== "not_started") return pending();
        await verify(accountId);
        const result = await boundedOwnerRequest(signal => options.api.startSession({ path: { communityId, postId }, body: saved.body }, signal));
        return accept(saved, result, false); // A retry/recovered response cannot register fresh grading inventory.
      }); } catch { return pending(); }
    },
  };
}
