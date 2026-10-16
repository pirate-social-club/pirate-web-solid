import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { onSessionCleared, onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { Button, Type } from "../../design-system.ts";
import { consumeEarnedDaySignal } from "./activity-earned-event.ts";
import { matchesCompletion, readCompletion, type ActivityCompletionData, type CompletionClient, type CompletionTarget } from "./activity-private-api.ts";

export interface ActivityCompletionDependencies { readonly client?: CompletionClient; readonly resolveSession?: () => Promise<SessionResolution> }
export function ActivityCompletion(props: CompletionTarget & { readonly ownerAccountId: string; readonly dependencies?: ActivityCompletionDependencies }) {
  const [state, setState] = createSignal<"loading" | "ready" | "anonymous" | "other-account" | "missing" | "error">("loading");
  const [data, setData] = createSignal<ActivityCompletionData>();
  const [freshEarned, setFreshEarned] = createSignal(false);
  let generation = 0; let disposed = false; let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const target = (): CompletionTarget => ({ communityId: props.communityId, postId: props.postId, personaId: props.personaId, attempt: props.attempt });
  const identity = () => JSON.stringify([props.ownerAccountId, props.communityId, props.postId, props.personaId, props.attempt]);
  const invalidate = () => { ++generation; controller?.abort(); clearTimeout(timer); setData(undefined); setFreshEarned(false); setState("loading"); };
  const load = async () => {
    invalidate(); const revision = generation; const key = identity(); const requested = target(); const account = props.ownerAccountId;
    const request = new AbortController(); controller = request;
    const current = () => !disposed && revision === generation && key === identity() && !request.signal.aborted;
    timer = setTimeout(() => { if (current()) { request.abort(); setState("error"); } }, 15_000);
    try {
      const session = await (props.dependencies?.resolveSession ?? resolveSession)();
      if (!current()) return;
      if (session === "anonymous") { setState("anonymous"); return; }
      if (session.userId !== account) { setState("other-account"); return; }
      const value = await readCompletion(requested, request.signal, props.dependencies?.client);
      if (!current()) return;
      const decision = value.decision;
      setFreshEarned(decision.status === "qualified" && decision.earned_day.status === "recorded"
        && (decision.earned_day.song_day_newly_earned || decision.earned_day.community_day_newly_earned)
        && consumeEarnedDaySignal(account, decision.earned_day.signal_id));
      setData(value); setState("ready");
    } catch (error) { if (current()) setState(error instanceof ApiClientError && error.status === 404 ? "missing" : "error"); }
    finally { if (revision === generation) clearTimeout(timer); }
  };
  createEffect(identity, () => { const revision = ++generation; controller?.abort(); if (!isServer) queueMicrotask(() => { if (!disposed && revision === generation) void load(); }); });
  if (!isServer) {
    let clearing = false;
    onCleanup(onSessionRefreshed(() => { if (!clearing) void load(); }));
    onCleanup(onSessionCleared(() => { clearing = true; invalidate(); setState("anonymous"); queueMicrotask(() => { clearing = false; }); }));
  }
  onCleanup(() => { disposed = true; ++generation; controller?.abort(); clearTimeout(timer); });
  const completion = () => { const value = data(); return value && matchesCompletion(value, target()) ? value : undefined; };
  const qualified = () => { const value = completion(); return value?.decision.status === "qualified" ? { decision: value.decision, timezone: value.timezone } : undefined; };
  const earned = () => { const value = qualified(); return value?.decision.earned_day.status === "recorded" ? value.decision.earned_day : undefined; };
  return <section aria-label="Activity qualification" class="space-y-3 rounded-xl border border-border-soft p-4" data-activity-completion>
    <Type as="h2" variant="h3">Qualification</Type>
    <Show when={state() !== "loading"} fallback={<p role="status">Checking this attempt…</p>}>
      <Show when={state() === "anonymous"}><p>Sign in to check this attempt.</p></Show>
      <Show when={state() === "other-account"}><p>This result belongs to a different signed-in account.</p></Show>
      <Show when={state() === "missing"}><p>Completion could not be found for this attempt.</p></Show>
      <Show when={state() === "error"}><p role="alert">Couldn't check this attempt.</p></Show>
      <Show when={state() === "ready" && completion()}>{value => <div class="space-y-2">
        <Show when={value().decision.status === "pending"}><p>Qualification is pending.</p></Show>
        <Show when={value().decision.status === "not_qualified"}><p>This attempt did not qualify.</p></Show>
        <Show when={value().decision.status === "refused"}><p>This activity was not completed. Qualification was refused.</p></Show>
        <Show when={value().decision.status === "unknown"}><p>The historical qualification decision is unavailable. No decision has been inferred.</p></Show>
        <Show when={qualified()}>{result => <>
          <p>This attempt qualified.</p>
          <Show when={result().decision.earned_day.status === "unavailable"}><p>Earned-day credit details are unavailable.</p></Show>
          <Show when={freshEarned() && earned()}>{day => <div role="status" data-earned-day-event><Show when={day().song_day_newly_earned}><p>Song streak day earned by this attempt.</p></Show><Show when={day().community_day_newly_earned}><p>Community streak day earned by this attempt.</p></Show></div>}</Show>
          <p>Streak date: {result().decision.streak_day} · {result().timezone}</p>
        </>}</Show>
      </div>}</Show>
      <Button variant="secondary" onClick={() => { void load(); }}>Check again</Button>
    </Show>
  </section>;
}
