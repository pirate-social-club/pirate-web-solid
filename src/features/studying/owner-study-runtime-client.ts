import { resolveSession } from "../../api/session";
import { ApiClientError } from "@pirate/api-client";
import type { GuestAuthorityStore } from "./guest-authority-selection";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import { sameGuestRewardTerms } from "./guest-study-reward-model";
import { boundedOwnerRequest, ownerStudyBindingValid, type OwnerStudyLocks, type OwnerStudySession } from "./owner-study-start-coordinator";
import { studyAttemptResult, studyLessonPayload } from "./study-lesson-projection";
import type { StudyingAttemptInput, StudyingClient } from "./studying-route-model";
export class OwnerStudyPendingAttempt extends Error {
  constructor() { super("The original Account answer remains unresolved. Retry its original request only."); }
}
export class OwnerStudyAccountRequired extends Error {
  readonly status = 401;
  constructor() { super("Restore the ordinary Account session before retrying the original answer."); }
}
export function createOwnerStudyRuntimeClient(options: {
  api: Pick<OwnerStudyFinancialApi, "getSession" | "submitAnswer">; store: GuestAuthorityStore; locks: OwnerStudyLocks;
  accountId: string; verifyAccount?: () => Promise<string | null>; originalKey: string; initial: OwnerStudySession; readOnlyRecovery: boolean;
  onChanged?: (value: OwnerStudySession) => void;
}): StudyingClient {
  let current = options.initial, busy = false;
  type Answer = Awaited<ReturnType<OwnerStudyFinancialApi["submitAnswer"]>>;
  let live: { input: StudyingAttemptInput; result?: Answer } | undefined;
  const original = options.initial;
  const validate = (next: OwnerStudySession) => {
    if (!ownerStudyBindingValid(next) || !sameGuestRewardTerms(next.reward_terms, original.reward_terms)
      || next.session.session_id !== original.session.session_id || next.session.persona_id !== original.session.persona_id)
      throw new OwnerStudyPendingAttempt();
  };
  const same = (a: StudyingAttemptInput, b: StudyingAttemptInput) => a.session_id === b.session_id && a.exercise_id === b.exercise_id
    && a.attempt_number === b.attempt_number && a.idempotency_key === b.idempotency_key && a.type === b.type
    && (a.type === "translation_choice" && b.type === "translation_choice" ? a.selected_option_id === b.selected_option_id
      : a.type === "say_it_back" && b.type === "say_it_back" && a.audio === b.audio && a.content_type === b.content_type && a.audio_duration_ms === b.audio_duration_ms);
  const record = async () => {
    const currentAccount = await boundedOwnerRequest(async () => {
      if (options.verifyAccount !== undefined) return options.verifyAccount();
      const account = await resolveSession(); return account === "anonymous" ? null : account.userId;
    });
    if (currentAccount !== options.accountId) throw new OwnerStudyAccountRequired();
    const r = (await options.store.read()).ownerStarts?.find(v => v.accountId === options.accountId && v.body.idempotency_key === options.originalKey);
    if (r?.state !== "completed" || r.sessionId !== original.session.session_id || r.inventory?.initialized !== true) throw new OwnerStudyPendingAttempt();
    return r;
  };
  validate(current);
  return {
    async loadLesson(postId) {
      if (postId !== original.session.post_id) throw new OwnerStudyPendingAttempt();
      return options.locks.exclusive(async () => {
        const r = await record(); if (r.inventory?.pending !== null || live !== undefined) throw new OwnerStudyPendingAttempt();
        const next = await boundedOwnerRequest(signal => options.api.getSession({ path: {
          communityId: original.session.community_id, sessionId: original.session.session_id,
        } }, signal)); await record(); validate(next); current = next; options.onChanged?.(next); return studyLessonPayload(next.session);
      });
    },
    async submitAttempt(input) {
      if (options.readOnlyRecovery || busy || (live !== undefined && !same(live.input, input))) throw new OwnerStudyPendingAttempt();
      const item = current.session.items.find(v => v.session_item_id === input.exercise_id);
      if (input.session_id !== original.session.session_id || item?.exercise_type !== input.type) throw new OwnerStudyPendingAttempt();
      if (live === undefined) live = { input: Object.freeze({ ...input }) };
      const owned = live; busy = true;
      try { return await options.locks.exclusive(async () => {
        const r = await record(), marker = { sessionItemId: owned.input.exercise_id, attemptNumber: owned.input.attempt_number, idempotencyKey: owned.input.idempotency_key };
        if (r.inventory?.pending !== null && JSON.stringify(r.inventory?.pending) !== JSON.stringify(marker)) throw new OwnerStudyPendingAttempt();
        await options.store.update(j => {
          const saved = j.ownerStarts?.find(v => v.accountId === options.accountId && v.body.idempotency_key === options.originalKey);
          if (saved?.inventory?.initialized !== true || saved.sessionId !== original.session.session_id) throw new OwnerStudyPendingAttempt();
          if (saved.inventory.pending !== null && JSON.stringify(saved.inventory.pending) !== JSON.stringify(marker)) throw new OwnerStudyPendingAttempt();
          saved.inventory.pending = marker;
        }); // Real metadata acknowledgment BEFORE answer/provider request.
        if (owned.result === undefined) {
          const answer = await boundedOwnerRequest(signal => options.api.submitAnswer({
            path: { communityId: original.session.community_id, sessionId: original.session.session_id, sessionItemId: owned.input.exercise_id },
            headers: { "content-type": owned.input.type === "translation_choice" ? "application/json" : owned.input.content_type,
              "idempotency-key": owned.input.idempotency_key, "x-study-attempt-number": String(owned.input.attempt_number),
              "x-audio-duration-ms": owned.input.type === "say_it_back" ? String(owned.input.audio_duration_ms) : undefined },
            body: owned.input.type === "translation_choice" ? { kind: "single_select", choice_key: owned.input.selected_option_id } : owned.input.audio,
          }, signal));
          validate({ object: "owner_account_study_session_v1", session: answer.answer.session, reward_terms: answer.reward_terms, participation: answer.participation });
          if (answer.answer.session_item_id !== owned.input.exercise_id || answer.answer.attempt_number !== owned.input.attempt_number) throw new OwnerStudyPendingAttempt();
          owned.result = answer; // An accepted live receipt retries only local clear if clear ACK is lost.
        }
        const accepted = owned.result;
        await record();
        await options.store.update(j => {
          const saved = j.ownerStarts?.find(v => v.accountId === options.accountId && v.body.idempotency_key === options.originalKey);
          if (saved?.inventory?.initialized !== true || JSON.stringify(saved.inventory.pending) !== JSON.stringify(marker)) throw new OwnerStudyPendingAttempt();
          saved.inventory.pending = null;
        });
        current = { object: "owner_account_study_session_v1", session: accepted.answer.session,
          reward_terms: accepted.reward_terms, participation: accepted.participation };
        live = undefined; options.onChanged?.(current);
        return { ...studyAttemptResult(accepted.answer, item.maximum_attempts), next_lesson: studyLessonPayload(current.session) };
      }); } catch (error) {
        if (error instanceof OwnerStudyAccountRequired) throw error;
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) throw new OwnerStudyAccountRequired();
        throw new OwnerStudyPendingAttempt();
      } finally { busy = false; }
    },
  };
}
