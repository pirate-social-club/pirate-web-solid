import { Show, createSignal, onCleanup, onSettled, type Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createSessionApiClient } from "../../api/client.ts";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { safeReturnPath } from "../auth/sign-in-return.ts";
import { AgeAccessPrompt } from "../verification/age-access-prompt.tsx";
import { Button, buttonVariants } from "../../design-system.ts";
import type { PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";
import { loadTargetedPost, type TargetedPostClient } from "./targeted-post.ts";
import { TargetedPersonaContext } from "./targeted-persona-context.ts";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";
import { bindPrivatePageLifecycle } from "./private-page-lifecycle.ts";

export function TargetedPostEntry(props: {
  readonly entry: Extract<PublicPostRouteState, { readonly kind: "target-entry" }>;
  readonly session?: () => Promise<SessionResolution>;
  readonly client?: TargetedPostClient;
  readonly children: (state: Accessor<Extract<PublicPostRouteState, { readonly kind: "content" }>>) => JSX.Element;
}) {
  const [state, setState] = createSignal<PublicPostRouteState>();
  const [persona, setPersona] = createSignal<string>();
  let active: AbortController | undefined, disposed = false;
  const load = async () => {
    active?.abort(); const request = new AbortController(); active = request; setState(undefined);
    const entry = props.entry;
    try {
      const session = await (props.session ?? resolveSession)();
      if (disposed || request.signal.aborted) return;
      if (session === "anonymous") { setState({ kind: "target-sign-in", status: 200, returnPath: entry.requestPath }); return; }
      const authority = captureSessionAuthority();
      const result = await loadTargetedPost(entry.requestPath, entry.locale, entry.canonicalOrigin, props.client ?? createSessionApiClient(), request.signal);
      if (disposed || request.signal.aborted || props.entry !== entry) return;
      if (captureSessionAuthority() !== authority) { setState({ kind: "unavailable", status: 502 }); return; }
      if (result.kind === "redirect") { location.replace(result.location); return; }
      setState(result);
    } catch { if (!disposed && !request.signal.aborted) setState({ kind: "unavailable", status: 502 }); }
  };
  onSettled(() => { void load(); });
  onCleanup(onSessionRefreshed(() => { setPersona(undefined); void load(); }));
  onCleanup(bindPrivatePageLifecycle(() => { active?.abort(); setState(undefined); }));
  onCleanup(() => { disposed = true; active?.abort(); });
  const content = () => { const value = state(); return value?.kind === "content" ? value : undefined; };
  const signIn = () => { const value = state(); return value?.kind === "target-sign-in" ? value.returnPath : undefined; };
  const age = () => state()?.kind === "target-age-locked" || state()?.kind === "age-locked";
  return <TargetedPersonaContext value={{ selected: persona, select: id => { setPersona(id); void load(); }, refuse: kind => {
    active?.abort();
    setState(kind === "age" ? { kind: "target-age-locked", status: 200 } : kind === "missing" ? { kind: "not-found", status: 404 } : { kind: "unavailable", status: 502 });
  } }}><Show when={content()} fallback={<main class="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8" data-target-entry>
    <Show when={state() === undefined}><p aria-busy="true">Loading comment thread…</p></Show>
    <Show when={signIn()}>{path => <><p>Sign in to open this comment.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(safeReturnPath(path(), location.origin) ?? "/")}`}>Sign in</a></>}</Show>
    <Show when={age()}><AgeAccessPrompt onVerified={async () => { await load(); }} /></Show>
    <Show when={state()?.kind === "not-found" || state()?.kind === "invalid"}><p role="alert">This comment is not available.</p></Show>
    <Show when={state()?.kind === "unavailable"}><p role="alert">This comment thread could not be loaded.</p><Button onClick={() => void load()} variant="secondary">Retry comment thread</Button></Show>
  </main>}>{value => props.children(value)}</Show></TargetedPersonaContext>;
}
