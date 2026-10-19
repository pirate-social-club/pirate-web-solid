import { ApiClientError } from "@pirate/api-client";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { isServer } from "@solidjs/web";
import { useLocation, useParams } from "@solidjs/router";
import { createSessionApiClient } from "../../api/client.ts";
import { onSessionRefreshed, resolveSession } from "../../api/session.ts";
import { safeReturnPath } from "../auth/sign-in-return.ts";
import { AgeAccessPrompt } from "../verification/age-access-prompt.tsx";
import { Button, buttonVariants } from "../../design-system.ts";
import { createCommentNavigationReader } from "./comment-navigation-api.ts";
import { commentSelector, validCommentId, withCommentSelector } from "./comment-selector.ts";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";
import { bindPrivatePageLifecycle } from "./private-page-lifecycle.ts";

/** Historical receipts enter here; content always belongs to the post route. */
export function CommentEntry(props: { readonly id: string }) {
  const [phase, setPhase] = createSignal<"loading" | "invalid" | "sign-in" | "missing" | "age" | "error">("loading");
  let request: AbortController | undefined, disposed = false, routeRevision = 0;
  // SSR emits only the loading shell, including renders outside a router.
  const route = isServer ? undefined : useLocation();
  const returnPath = () => `/comments/${encodeURIComponent(props.id)}`;
  const load = async () => {
    request?.abort(); const active = new AbortController(); request = active; setPhase("loading");
    const identity = { id: props.id, pathname: route!.pathname, search: route!.search };
    const validSelector = () => {
      const selector = commentSelector(route!.search);
      return validCommentId(props.id) && selector.kind !== "invalid" && (selector.kind !== "target" || selector.id === props.id);
    };
    const owns = () => !disposed && !active.signal.aborted && request === active && props.id === identity.id &&
      route!.pathname === identity.pathname && route!.search === identity.search && validSelector();
    if (!validSelector()) { active.abort(); setPhase("invalid"); return; }
    try {
      const session = await resolveSession();
      if (!owns()) return;
      if (session === "anonymous") { setPhase("sign-in"); return; }
      const authority = captureSessionAuthority();
      const value = await createCommentNavigationReader(createSessionApiClient())(identity.id, active.signal);
      if (!owns()) return;
      if (captureSessionAuthority() !== authority) { setPhase("error"); return; }
      if (value.kind === "age_locked") { setPhase("age"); return; }
      const path = safeReturnPath(withCommentSelector(value.post_path, value.target_comment_id), location.origin);
      if (!path) throw new Error("unsafe_destination");
      if (owns()) location.replace(path);
    } catch (error) {
      if (!owns()) return;
      setPhase(error instanceof ApiClientError && error.status === 401 ? "sign-in" : error instanceof ApiClientError && error.status === 404 ? "missing" : "error");
    }
  };
  createEffect(() => [props.id, route?.pathname, route?.search] as const, () => {
    const revision = ++routeRevision;
    request?.abort();
    // Solid's owned effect observes route identity; async UI writes begin
    // outside that scope, and rapid navigations coalesce to the current route.
    queueMicrotask(() => { if (!disposed && revision === routeRevision) void load(); });
  });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(() => { request?.abort(); setPhase("loading"); }));
  onCleanup(() => { disposed = true; request?.abort(); });
  return <main class="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8" data-comment-entry={phase()}>
    <Show when={phase() === "loading"}><p aria-busy="true">Finding comment…</p></Show>
    <Show when={phase() === "sign-in"}><p>Sign in to open this comment.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(returnPath())}`}>Sign in</a></Show>
    <Show when={phase() === "age"}><AgeAccessPrompt onVerified={async () => { await load(); }} /></Show>
    <Show when={phase() === "missing" || phase() === "invalid"}><p role="alert">This comment is not available.</p></Show>
    <Show when={phase() === "error"}><p role="alert">This comment could not be loaded.</p><Button onClick={() => void load()} variant="secondary">Retry comment</Button></Show>
  </main>;
}
export function CommentEntryRoute() {
  const params = useParams();
  return <Show when={params.id} keyed>{id => <CommentEntry id={id} />}</Show>;
}
