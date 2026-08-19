/** @jsxImportSource @solidjs/web */
import { For, Show, createMemo, createSignal } from "solid-js";

import { Avatar, Button, Card, CardContent, CommunityAvatar, Separator, Type } from "@pirate/web-solid-ui";
import { CommunityPostCard } from "./community-post-card";
import {
  gateSummary,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityData,
  type CommunitySort,
  type CommunitySurface,
} from "./page-shell-model";

export interface CommunityPageShellProps {
  community: CommunityData;
  empty?: boolean;
  mobile?: boolean;
  following: boolean;
  joined: boolean;
  canJoin?: boolean;
  showCreatePost?: boolean;
  showWatchTab?: boolean;
  activeSurface?: CommunitySurface;
  onSurfaceChange?: (surface: CommunitySurface) => void;
  onFollowToggle?: () => void;
  onJoin?: () => void;
  onCreatePost?: () => void;
  onPostOpen?: (postId: string) => void;
  onPostShare?: (postId: string) => void;
  onPostVote?: (postId: string, direction: "up" | "down") => void;
}

function tabClass(active: boolean): string {
  return active
    ? "border-b-2 border-primary px-1 py-3 text-foreground"
    : "border-b-2 border-transparent px-1 py-3 text-muted-foreground hover:text-foreground";
}

function parseCommunitySort(value: string): CommunitySort {
  return value === "new" || value === "top" ? value : "best";
}

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal<CommunitySort>("best");
  const [tab, setTab] = createSignal<"feed" | "about">("feed");
  const [surface, setSurface] = createSignal<CommunitySurface>(props.activeSurface ?? "threads");
  const community = () => props.community;
  const showWatchTab = () => props.showWatchTab ?? community().videoFeedEnabled === true;
  const sortedPosts = createMemo(() => sortCommunityPosts(community().posts, sort()));
  const hasPosts = () => !props.empty && sortedPosts().length > 0;

  const changeSurface = (next: CommunitySurface) => {
    props.onSurfaceChange?.(next);
    if (props.onSurfaceChange) setSurface(next);
  };

  return (
    <section
      class={props.mobile ? "w-full bg-background" : "mx-auto w-full max-w-6xl bg-background"}
      data-community-page
      data-community-surface={surface()}
    >
      <header class="overflow-hidden rounded-[var(--radius-3xl)] border border-border-soft bg-card shadow-[var(--shadow-md)]">
        <div class="relative h-48 overflow-hidden bg-gradient-to-br from-teal-900 via-slate-800 to-indigo-950 md:h-72">
          <Show
            when={community().bannerSrc}
            fallback={<div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(165deg,rgba(31,111,73,0.95),rgba(11,55,73,0.96)_55%,rgba(29,31,63,0.98))]" />}
          >
            {(bannerSrc) => <img alt={`${community().name} banner`} class="h-full w-full object-cover" src={bannerSrc()} />}
          </Show>
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/45" />
        </div>

        <div class="relative px-5 pb-5 md:px-8 md:pb-7">
          <div class="-mt-12 flex flex-col gap-4 md:-mt-16 md:flex-row md:items-end md:justify-between md:gap-6">
            <div class="flex min-w-0 items-end gap-4">
              <div class="size-24 shrink-0 overflow-hidden rounded-full border-4 border-card bg-card shadow-lg md:size-28">
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  class="size-full"
                  communityId={community().handle}
                  displayName={community().name}
                  size="lg"
                />
              </div>
              <div class="min-w-0 pb-1">
                <Type as="h1" variant="h1" class="truncate">{community().name}</Type>
                <Type variant="caption">{community().handle}</Type>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3" aria-label="Community actions">
              <Button onClick={() => props.onFollowToggle?.()} variant={props.following ? "secondary" : "default"}>
                {props.following ? "Following" : "Follow"}
              </Button>
              <Show when={props.canJoin !== false}>
                <Button disabled={props.joined} onClick={() => props.onJoin?.()} variant="secondary">
                  {props.joined ? "Joined" : "Join"}
                </Button>
              </Show>
              <Show when={props.joined || props.showCreatePost}>
                <Button onClick={() => props.onCreatePost?.()} variant="secondary">Create Post</Button>
              </Show>
            </div>
          </div>
          <Type as="p" variant="body" class="mt-4 max-w-2xl text-muted-foreground">{community().description}</Type>
        </div>
      </header>

      <nav aria-label="Community surfaces" class="mt-4 flex items-center gap-7 border-b border-border-soft px-1">
        <Show when={showWatchTab()}>
          <button class={tabClass(surface() === "videos")} onClick={() => changeSurface("videos")} type="button">Watch</button>
        </Show>
        <button class={tabClass(surface() === "threads")} onClick={() => changeSurface("threads")} type="button">Threads</button>
      </nav>

      <div class="mt-4 flex items-center gap-6 border-b border-border-soft px-1 md:hidden">
        <button class={tab() === "feed" ? tabClass(true) : tabClass(false)} onClick={() => setTab("feed")} type="button">Feed</button>
        <button class={tab() === "about" ? tabClass(true) : tabClass(false)} onClick={() => setTab("about")} type="button">About</button>
      </div>

      <div class="grid gap-6 py-4 md:grid-cols-[minmax(0,1fr)_18rem] md:py-6">
        <main class={tab() === "about" ? "hidden md:block" : "min-w-0"} aria-label="Community feed">
          <div class="mb-3 flex items-center justify-between gap-3 px-1">
            <Type as="h2" variant="h2">Threads</Type>
            <label class="flex items-center gap-2">
              <Type as="span" variant="label">Sort</Type>
              <select aria-label="Sort community feed" class="rounded-full border border-border-soft bg-card px-3 py-2 text-sm" onChange={(event) => setSort(parseCommunitySort(event.currentTarget.value))} value={sort()}>
                <option value="best">Best</option>
                <option value="new">New</option>
                <option value="top">Top</option>
              </select>
            </label>
          </div>
          <Show
            when={hasPosts()}
            fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}
          >
            <div class="overflow-hidden rounded-[var(--radius-lg)] border border-border-soft bg-background">
              <For each={sortedPosts()}>
                {(post) => (
                  <CommunityPostCard
                    onOpen={props.onPostOpen}
                    onShare={props.onPostShare}
                    onVote={props.onPostVote}
                    post={post}
                  />
                )}
              </For>
            </div>
          </Show>
        </main>

        <aside class={tab() === "about" ? "flex min-w-0 flex-col gap-4" : "hidden min-w-0 flex-col gap-4 md:flex"} aria-label="Community information">
          <Card>
            <CardContent class="flex flex-col gap-5 p-5">
              <div class="flex items-center gap-3">
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  communityId={community().handle}
                  displayName={community().name}
                  size="md"
                />
                <div class="min-w-0">
                  <Type as="h3" variant="h3" class="truncate">{community().name}</Type>
                  <Type variant="caption">{community().handle}</Type>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div><Type as="div" variant="h3">{community().followers.toLocaleString("en-US")}</Type><Type variant="caption">Followers</Type></div>
                <div><Type as="div" variant="h3">{community().members.toLocaleString("en-US")}</Type><Type variant="caption">Citizens</Type></div>
              </div>

              <Show when={community().owner}>
                {(owner) => <div class="flex flex-col gap-2"><Type variant="label">Owner</Type><div class="flex items-center gap-3"><AvatarHolder holder={owner()} /></div></div>}
              </Show>

              <Show when={community().gates?.length}>
                <div class="flex flex-col gap-2">
                  <Type variant="label">Gates</Type>
                  <Type variant="caption">{gateSummary(community().gates ?? [], community().gateMode ?? "unknown")}</Type>
                  <ul class="flex flex-col gap-2">
                    <For each={community().gates}>{(gate) => <li class="flex items-center justify-between gap-3 border-t border-border-soft pt-2"><Type variant="body">{gate.label}</Type><Type variant="caption">{gate.status}</Type></li>}</For>
                  </ul>
                </div>
              </Show>

              <Show when={community().rules?.length}>
                <Separator />
                <div class="flex flex-col gap-3"><Type variant="label">Community rules</Type><ol class="flex flex-col gap-3"><For each={orderedCommunityRules(community().rules ?? [])}>{(rule) => <li><Type as="div" variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></li>}</For></ol></div>
              </Show>

              <Show when={community().referenceLinks?.length}>
                <Separator />
                <nav aria-label="Community reference links"><Type variant="label">Links</Type><ul class="mt-2 flex flex-col gap-2"><For each={orderedReferenceLinks(community().referenceLinks ?? [])}>{(link) => <Show when={safeCommunityHref(link.href)}>{(href) => <li><a aria-label={`Open ${link.label}`} class="text-foreground underline underline-offset-4" href={href()} rel="noreferrer" target="_blank">{link.label}</a></li>}</Show>}</For></ul></nav>
              </Show>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function AvatarHolder(props: { holder: { displayName: string; handle: string; avatarSrc?: string } }) {
  return (
    <>
      <Avatar
        fallback={props.holder.displayName}
        size="sm"
        src={props.holder.avatarSrc}
      />
      <div class="min-w-0"><Type as="div" variant="label" class="truncate">{props.holder.displayName}</Type><Type variant="caption">{props.holder.handle}</Type></div>
    </>
  );
}
