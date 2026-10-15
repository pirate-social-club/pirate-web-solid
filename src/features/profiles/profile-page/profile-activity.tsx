import { getRequestEvent } from "@solidjs/web";
import type { GetPublicProfileActivityResponse, PirateApiClient } from "@pirate/api-client";
import { For, Show, createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import { createPublicApiClient, createSessionApiClient } from "../../../api/client.ts";
import { onSessionRefreshed, resolveSession } from "../../../api/session.ts";
import { Button, Type } from "../../../design-system.ts";
import { projectCommunityThreadPost } from "../../communities/community-page/community-thread-feed-api.ts";
import { CommunityPostCard } from "../../community/page-shell/page-shell.tsx";
import { PublicPostEngagement, type PublicPostEngagementDependencies } from "../../posts/public-post/public-post-engagement.tsx";

type Item = GetPublicProfileActivityResponse["items"][number];
export interface ProfileActivityDependencies {
  readonly client?: Pick<PirateApiClient, "get_publicPersonasPersonaIdActivity">;
  readonly resolveSession?: typeof resolveSession;
  readonly engagement?: PublicPostEngagementDependencies;
}

/**
 * One feed of everything the profile has posted, newest first: songs, videos
 * and text in the shared post card. There are no tabs, and comments are not
 * listed here; they live on their posts. Ordering is the server's.
 */
function ActivityItem(props: { readonly item: Item; readonly dependencies?: PublicPostEngagementDependencies }) {
  const post = () => props.item.kind === "post" ? projectCommunityThreadPost(props.item.content) : null;
  return <>
    <Show when={post()}>{value => <PublicPostEngagement post={{ id: value().id, upvoteCount: value().upvoteCount ?? 0, downvoteCount: value().downvoteCount ?? 0, commentCount: value().commentCount ?? 0 }} communityId={props.item.community_id} canReportPost={value().supportsPostReports} showSignInPrompt={false} dependencies={props.dependencies}>
      {(controls, actions) => <CommunityPostCard post={value()} communityId={props.item.community_id} titleHref={props.item.href ?? undefined} actions={controls} menuActions={actions} />}
    </PublicPostEngagement>}</Show>
  </>;
}

/** Viewer-authorized activity is loaded only after hydration and session resolution. */
export function ProfileActivity(props: { readonly personaId: string; readonly dependencies?: ProfileActivityDependencies }) {
  const event = getRequestEvent();
  // SAFETY: entry-server supplies this presentation-only flag for static handle hosts.
  const disabled = (event?.locals as { profileActivityHydrationDisabled?: boolean } | undefined)?.profileActivityHydrationDisabled === true;
  const [mounted, setMounted] = createSignal(false);
  const [items, setItems] = createSignal<readonly Item[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [state, setState] = createSignal<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = createSignal(false);
  let generation = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  const load = async (more = false) => {
    if (!mounted() || (more && (loadingMore() || !cursor()))) return;
    const request = ++generation;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    const personaId = props.personaId;
    const previousCursor = more ? cursor() : null;
    if (more) setLoadingMore(true);
    else { setItems([]); setCursor(null); setState("loading"); setLoadingMore(false); }
    try {
      const viewer = await (props.dependencies?.resolveSession ?? resolveSession)();
      if (disposed || request !== generation) return;
      const client = props.dependencies?.client ?? (viewer === "anonymous" ? createPublicApiClient() : createSessionApiClient());
      const page = await client.get_publicPersonasPersonaIdActivity({
        path: { personaId }, query: { surface: "posts", ...(previousCursor ? { cursor: previousCursor } : {}) },
      }, { signal });
      if (disposed || request !== generation) return;
      if (page.next_cursor !== null && page.next_cursor === previousCursor) throw new Error("non_advancing_activity_cursor");
      setItems(prior => {
        const base = more ? prior : [];
        const seen = new Set(base.map(item => `${item.kind}:${item.activity_id}`));
        return [...base, ...page.items.filter(item => {
          const key = `${item.kind}:${item.activity_id}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        })];
      });
      setCursor(page.next_cursor); setState("ready");
    } catch {
      if (!disposed && request === generation) setState("error");
    } finally {
      if (!disposed && request === generation) setLoadingMore(false);
    }
  };
  onSettled(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => { if (!disposed) setMounted(true); });
    const unsubscribe = onSessionRefreshed(() => { void load(); });
    return unsubscribe;
  });
  createEffect(() => [mounted(), props.personaId] as const, ([ready]) => {
    const revision = ++generation;
    abort?.abort();
    queueMicrotask(() => { if (ready && !disposed && revision === generation) void load(); });
  });
  onCleanup(() => { disposed = true; generation++; abort?.abort(); });
  return <Show when={!disabled}><section aria-label="Posts" data-profile-activity>
    <Show when={mounted() && state() !== "loading"} fallback={<Type class="block py-5" role="status" variant="body">Loading posts…</Type>}>
      <div class="flex flex-col"><For each={items()}>{item => <ActivityItem item={item} dependencies={props.dependencies?.engagement} />}</For></div>
      <Show when={state() === "ready" && items().length === 0}><Type as="p" class="py-5" variant="body">No posts to show.</Type></Show>
      <Show when={state() === "error"}><div class="flex flex-col items-start gap-3 py-5"><Type role="alert" variant="body">Posts could not be loaded.</Type><Button variant="secondary" onClick={() => { void load(items().length > 0); }}>Try again</Button></div></Show>
      <Show when={state() === "ready" && cursor()}><div class="py-5"><Button variant="secondary" disabled={loadingMore()} onClick={() => { void load(true); }}>{loadingMore() ? "Loading…" : "Load more"}</Button></div></Show>
    </Show>
  </section></Show>;
}
