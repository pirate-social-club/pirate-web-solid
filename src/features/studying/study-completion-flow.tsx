import type { JSX } from "@solidjs/web";
import { isServer } from "@solidjs/web";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { onSessionCleared, onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { consumeEarnedDaySignal } from "../activity/activity-earned-event.ts";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle.ts";
import { readCompletion, readPrivateProgress, type CompletionClient, type CompletionTarget, type PrivateActivityClient } from "../activity/activity-private-api.ts";
import type { StudyingSurfaceState } from "./studying-model.ts";
import { StudyingSurface } from "./studying-surface.tsx";

type CompleteState = Extract<StudyingSurfaceState, { kind: "complete" }>;
interface EarnedStreak { readonly signalId: string; readonly count: number; readonly week: readonly boolean[] }

export interface StudyCompletionFlowProps extends CompletionTarget {
  readonly ownerAccountId: string;
  readonly result: CompleteState;
  readonly rewardSlot?: JSX.Element;
  readonly onExit?: () => void;
  readonly onStudyAgain?: () => void;
  readonly dependencies?: {
    readonly resolveSession?: () => Promise<SessionResolution>;
    readonly resolveFreshSession?: () => Promise<SessionResolution>;
    readonly completionClient?: CompletionClient;
    readonly progressClient?: PrivateActivityClient;
  };
}

/** Results first, then the existing streak presentation only for a day this
 * exact attempt earned. Optional private reads never hold the learner here. */
export function StudyCompletionFlow(props: StudyCompletionFlowProps) {
  const [earned, setEarned] = createSignal<EarnedStreak>();
  const [showStreak, setShowStreak] = createSignal(false);
  let generation = 0;
  let disposed = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const identity = () => JSON.stringify([props.ownerAccountId, props.communityId, props.postId, props.personaId, props.attempt]);
  const invalidate = () => {
    ++generation; controller?.abort(); clearTimeout(timer);
    setEarned(undefined); setShowStreak(false);
  };
  const load = async () => {
    invalidate();
    const revision = generation;
    const key = identity();
    const account = props.ownerAccountId;
    const target: CompletionTarget = { communityId: props.communityId, postId: props.postId, personaId: props.personaId, attempt: props.attempt };
    const request = new AbortController(); controller = request;
    const current = () => !disposed && revision === generation && identity() === key && !request.signal.aborted;
    timer = setTimeout(() => { if (current()) request.abort(); }, 10_000);
    try {
      const session = await (props.dependencies?.resolveSession ?? resolveSession)();
      if (!current() || session === "anonymous" || session.userId !== account) return;
      const completion = await readCompletion(target, request.signal, props.dependencies?.completionClient);
      if (!current()) return;
      const decision = completion.decision;
      if (decision.status !== "qualified" || decision.earned_day.status !== "recorded" || !decision.earned_day.song_day_newly_earned) return;
      const progress = await readPrivateProgress({ communityId: target.communityId, postId: target.postId }, request.signal, props.dependencies?.progressClient);
      if (!current() || progress.timezone !== completion.timezone || !progress.timezone_pinned
        || progress.today !== decision.streak_day || progress.streak.last_day !== decision.streak_day
        || progress.streak.current < 1 || progress.week.days.length !== 7
        || !progress.week.days.some(day => day.day === decision.streak_day && day.earned)) return;
      // A cookie can change in another tab without a local session event.
      // Read through the uncached path without broadcasting a route refresh.
      const fresh = await (props.dependencies?.resolveFreshSession ?? (() => resolveSession({ fetchImpl: fetch })))();
      if (!current() || fresh === "anonymous" || fresh.userId !== account) return;
      setEarned({ signalId: decision.earned_day.signal_id, count: progress.streak.current, week: progress.week.days.map(day => day.earned) });
    } catch {
      // The completed score is authoritative without optional streak details.
      // Do not replace it with an error panel or fabricate a streak on failure.
    } finally {
      if (generation === revision) clearTimeout(timer);
    }
  };
  createEffect(identity, () => {
    const revision = ++generation;
    controller?.abort(); setEarned(undefined); setShowStreak(false);
    if (!isServer) queueMicrotask(() => { if (!disposed && revision === generation) void load(); });
  });
  if (!isServer) {
    let clearing = false;
    onCleanup(bindPrivatePageLifecycle(invalidate));
    onCleanup(onSessionRefreshed(() => { if (!clearing) void load(); }));
    onCleanup(onSessionCleared(() => { clearing = true; invalidate(); queueMicrotask(() => { clearing = false; }); }));
  }
  onCleanup(() => { disposed = true; invalidate(); });
  const continueResult = () => {
    const value = earned();
    if (!showStreak() && value && consumeEarnedDaySignal(props.ownerAccountId, value.signalId)) setShowStreak(true);
    else props.onExit?.();
  };
  const surface = (): CompleteState => {
    const value = earned();
    // No previous-streak value is inferred for the celebration animation.
    return showStreak() && value ? {
      ...props.result,
      previousStreak: undefined,
      streak: { currentStreak: value.count, qualifiedToday: true },
      streakWeek: value.week,
    } : { ...props.result, streak: undefined, previousStreak: undefined, streakWeek: undefined };
  };
  return <StudyingSurface
    state={surface()}
    rewardSlot={showStreak() ? undefined : props.rewardSlot}
    onExit={continueResult}
    onStudyAgain={showStreak() ? undefined : props.onStudyAgain}
  />;
}
