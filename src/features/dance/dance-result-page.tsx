import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { Button, buttonVariants, Type } from "../../design-system.ts";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle.ts";
import { createDanceResultApi, danceResultPath, danceResultPresentation, type DanceResult, type DanceResultApi } from "./dance-result-api.ts";

type State = { readonly phase: "loading" | "anonymous" | "unavailable" | "error" } | { readonly phase: "ready"; readonly result: DanceResult };

export function DanceResultPage(props: { readonly communityId: string; readonly reviewId: string; readonly api?: DanceResultApi; readonly session?: () => Promise<SessionResolution> }) {
  const api = untrack(() => props.api ?? createDanceResultApi());
  // Route changes must clear private content synchronously inside the owned effect.
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  let active = true, revision = 0, request: AbortController | undefined;
  const clear = () => { revision++; request?.abort(); setState({ phase: "loading" }); };
  const load = async () => {
    clear();
    const attempt = revision, communityId = props.communityId, reviewId = props.reviewId;
    const current = new AbortController(); request = current;
    const owns = () => active && !current.signal.aborted && attempt === revision && props.communityId === communityId && props.reviewId === reviewId;
    try {
      const session = await (props.session ?? resolveSession)();
      if (!owns()) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      const authority = captureSessionAuthority();
      const result = await api.read({ communityId, reviewId, accountId: session.userId }, current.signal);
      if (!owns()) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      setState({ phase: "ready", result });
    } catch (error) {
      if (!owns()) return;
      setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : error instanceof ApiClientError && error.declaredName === "NotFound" ? "unavailable" : "error" });
    }
  };
  createEffect(() => [props.communityId, props.reviewId] as const, () => {
    clear(); const attempt = revision;
    if (!isServer) queueMicrotask(() => { if (active && attempt === revision) void load(); });
  });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { active = false; revision++; request?.abort(); });
  const result = () => { const current = state(); return current.phase === "ready" ? current.result : undefined; };
  return <main class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8" data-dance-result={state().phase}>
    <Type as="h1" variant="h1">Your dance result</Type>
    <Show when={state().phase === "loading"}><p aria-busy="true">Loading your dance result…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to view your dance result.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceResultPath(props.communityId, props.reviewId))}`}>Sign in</a></Show>
    <Show when={state().phase === "unavailable"}><p role="alert">This dance result is not available.</p></Show>
    <Show when={state().phase === "error"}><p role="alert">Your dance result could not be loaded.</p><Button variant="secondary" onClick={() => void load()}>Retry dance result</Button></Show>
    <Show when={result()}>{value => <>
      <section class="space-y-3 rounded-xl border border-border-soft p-5" aria-label="Dance review result" aria-live="polite">
        <Type as="h2" variant="h2">{danceResultPresentation(value()).title}</Type>
        <p>{danceResultPresentation(value()).detail}</p>
        <Show when={value().submitted_at}>{submitted => <p class="text-sm text-muted-foreground">Submitted <time datetime={submitted()}>{submitted()}</time></p>}</Show>
        <Show when={value().state === "screening" || value().state === "awaiting_review"}><p class="text-sm text-muted-foreground">Review deadline: <time datetime={value().review_deadline}>{value().review_deadline}</time></p></Show>
        <Show when={value().publication_status === "pending"}><p>Your separate video post is being prepared.</p></Show>
        <Show when={value().publication_status === "failed"}><p>The video post could not be created. Your private result is unchanged.</p></Show>
      </section>
      <a class={buttonVariants({ variant: "secondary" })} href={`/post/${encodeURIComponent(value().song_post_id)}`}>Back to song</a>
    </>}</Show>
    <a class="text-sm underline" href="/activity">Notifications</a>
  </main>;
}

export function DanceResultRoute() {
  const params = useParams();
  return <Show when={params.communityId} keyed>{communityId => <Show when={params.reviewId} keyed>{reviewId => <DanceResultPage communityId={communityId} reviewId={reviewId} />}</Show>}</Show>;
}
