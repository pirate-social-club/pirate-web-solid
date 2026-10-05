import { getRequestEvent } from "@solidjs/web";
import type { GetPublicProfileActivityResponse, PirateApiClient } from "@pirate/api-client";
import { For, Show, createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import { createPublicApiClient, createSessionApiClient } from "../../../api/client.ts";
import { onSessionRefreshed, resolveSession } from "../../../api/session.ts";
import { Button, IconChatCircle, IconHouse, IconList, Tabs, TabsContent, TabsList, TabsTrigger, Type } from "../../../design-system.ts";
import { projectCommunityThreadPost } from "../../communities/community-page/community-thread-feed-api.ts";
import { CommunityPostCard } from "../../community/page-shell/page-shell.tsx";
import { projectPublishedComment } from "../../posts/post-engagement/comment-thread-api.ts";
import { PublicPostEngagement, type PublicPostEngagementDependencies } from "../../posts/public-post/public-post-engagement.tsx";
import { CommentCard } from "../../posts/shared-engagement/comment-card.tsx";

export type ProfileActivityTab = "overview" | "posts" | "comments";
type Item = GetPublicProfileActivityResponse["items"][number];
export interface ProfileActivityDependencies {
  readonly client?: Pick<PirateApiClient, "get_publicPersonasPersonaIdActivity">;
  readonly resolveSession?: typeof resolveSession;
  readonly engagement?: PublicPostEngagementDependencies;
}

function tabFromHash(): ProfileActivityTab {
  const hash = globalThis.window?.location.hash.slice(1);
  return hash === "posts" || hash === "comments" ? hash : "overview";
}

function ActivityItem(props: { readonly item: Item; readonly dependencies?: PublicPostEngagementDependencies }) {
  const post = () => props.item.kind === "post" ? projectCommunityThreadPost(props.item.content) : null;
  const comment = () => props.item.kind === "comment" ? props.item : undefined;
  return <>
    <Show when={post()}>{value => <PublicPostEngagement post={{ id: value().id, upvoteCount: value().upvoteCount ?? 0, downvoteCount: value().downvoteCount ?? 0, commentCount: value().commentCount ?? 0 }} communityId={props.item.community_id} canReportPost={value().supportsPostReports} showSignInPrompt={false} dependencies={props.dependencies}>
      {(controls, actions) => <>
        <Show when={props.item.href}><a href={props.item.href!} class="inline-block pt-3 text-sm text-muted-foreground hover:underline">Open post</a></Show>
        <CommunityPostCard post={value()} communityId={props.item.community_id} actions={controls} menuActions={actions} />
      </>}
    </PublicPostEngagement>}</Show>
    <Show when={comment()}>{value => <CommentCard item={projectPublishedComment(value().comment)} nested={false} communityLabel={value().community_name}
      postContext={value().href ? { title: value().post_title ?? "Open post", href: value().href! } : undefined} />}</Show>
  </>;
}

/** Viewer-authorized activity is loaded only after hydration and session resolution. */
export function ProfileActivity(props: { readonly personaId: string; readonly dependencies?: ProfileActivityDependencies }) {
  const event = getRequestEvent();
  // SAFETY: entry-server supplies this presentation-only flag for static handle hosts.
  const disabled = (event?.locals as { profileActivityHydrationDisabled?: boolean } | undefined)?.profileActivityHydrationDisabled === true;
  const [tab, setTab] = createSignal<ProfileActivityTab>("overview");
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
    const surface = tab();
    const previousCursor = more ? cursor() : null;
    if (more) setLoadingMore(true);
    else { setItems([]); setCursor(null); setState("loading"); setLoadingMore(false); }
    try {
      const viewer = await (props.dependencies?.resolveSession ?? resolveSession)();
      if (disposed || request !== generation) return;
      const client = props.dependencies?.client ?? (viewer === "anonymous" ? createPublicApiClient() : createSessionApiClient());
      const page = await client.get_publicPersonasPersonaIdActivity({
        path: { personaId }, query: { surface, ...(previousCursor ? { cursor: previousCursor } : {}) },
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
    queueMicrotask(() => { if (!disposed) { setTab(tabFromHash()); setMounted(true); } });
    const changed = () => setTab(tabFromHash());
    window.addEventListener("hashchange", changed);
    const unsubscribe = onSessionRefreshed(() => { void load(); });
    return () => { window.removeEventListener("hashchange", changed); unsubscribe(); };
  });
  createEffect(() => [mounted(), props.personaId, tab()] as const, ([ready]) => {
    const revision = ++generation;
    abort?.abort();
    queueMicrotask(() => { if (ready && !disposed && revision === generation) void load(); });
  });
  onCleanup(() => { disposed = true; generation++; abort?.abort(); });
  const changeTab = (value: string) => {
    if (value !== "overview" && value !== "posts" && value !== "comments") return;
    setTab(value);
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", `#${value}`);
  };
  return <Show when={!disabled}><section aria-label="Profile activity" data-profile-activity>
    <Show when={mounted()} fallback={<Type role="status" variant="body">Loading activity…</Type>}>
    <Tabs value={tab()} onChange={changeTab}>
      <TabsList columns={3} variant="underline" aria-label="Profile activity">
        <TabsTrigger value="overview" variant="underline" aria-label="Overview"><IconHouse class="size-5 md:hidden" /><span class="sr-only md:not-sr-only">Overview</span></TabsTrigger>
        <TabsTrigger value="posts" variant="underline" aria-label="Posts"><IconList class="size-5 md:hidden" /><span class="sr-only md:not-sr-only">Posts</span></TabsTrigger>
        <TabsTrigger value="comments" variant="underline" aria-label="Comments"><IconChatCircle class="size-5 md:hidden" /><span class="sr-only md:not-sr-only">Comments</span></TabsTrigger>
      </TabsList>
      <For each={["overview", "posts", "comments"] as const}>{surface => <TabsContent value={surface}>
        <Show when={state() !== "loading"} fallback={<Type role="status" variant="body">Loading activity…</Type>}>
          <div class="flex flex-col gap-4"><For each={items()}>{item => <ActivityItem item={item} dependencies={props.dependencies?.engagement} />}</For></div>
          <Show when={state() === "ready" && items().length === 0}><Type variant="body">No {surface === "overview" ? "activity" : surface} to show.</Type></Show>
          <Show when={state() === "error"}><Type role="alert" variant="body">Activity could not be loaded.</Type><Button variant="secondary" onClick={() => { void load(items().length > 0); }}>Try again</Button></Show>
          <Show when={state() === "ready" && cursor()}><Button variant="secondary" disabled={loadingMore()} onClick={() => { void load(true); }}>{loadingMore() ? "Loading…" : "Load more"}</Button></Show>
        </Show>
      </TabsContent>}</For>
    </Tabs>
    </Show>
  </section></Show>;
}
