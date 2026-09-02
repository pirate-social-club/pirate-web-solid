/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Show, createMemo, createSignal } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CommunityAvatar,
  FlatTabBar,
  FlatTabButton,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconChatCircle,
  IconDotsThree,
  IconMusicNote,
  IconPlay,
  IconPlus,
  IconShield,
  IconButton,
  MediaControlButton,
  Separator,
  Type,
} from "@pirate/web-solid-ui";
import {
  gateSummary,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityData,
  type CommunityPost,
  type CommunitySort,
} from "./page-shell-model";

export interface CommunityPageShellProps {
  community: CommunityData;
  empty?: boolean;
  mobile?: boolean;
  following: boolean;
  joined: boolean;
  onFollowToggle?: () => void;
  onJoin?: () => void;
  followBusy?: boolean;
  joinBusy?: boolean;
  joinDisabled?: boolean;
  joinLabel?: string;
  onManage?: () => void;
  onCreatePost?: () => void;
  createPostBusy?: boolean;
  onBack?: () => void;
  onMore?: () => void;
  canJoin?: boolean;
  showCreatePost?: boolean;
  readOnly?: boolean;
  postsLoading?: boolean;
  postsError?: boolean;
  personaControl?: JSX.Element;
  renderPost?: (
    post: CommunityPost,
    render: (actions?: JSX.Element) => JSX.Element,
  ) => JSX.Element;
}

type CommunityTab = "feed" | "songs" | "leaderboard" | "about";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function postTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const age = Math.max(0, Date.now() - date.getTime());
  const hours = Math.floor(age / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${Math.max(1, days)}d ago`;
}

function PostActions(props: { post: CommunityPost; engagementControls?: JSX.Element }) {
  return (
    <div class="flex flex-wrap items-center gap-2 pt-1" aria-label="Post actions">
      <Show when={props.engagementControls} fallback={
        <>
          <button aria-label={`Upvote post, ${props.post.score} points`} class="inline-flex h-9 items-center gap-1 rounded-full border border-border-soft px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" type="button">
            <IconArrowUp class="size-4" />
            <span>{props.post.score}</span>
          </button>
          <button aria-label="Downvote post" class="inline-flex size-9 items-center justify-center rounded-full border border-border-soft text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" type="button">
            <IconArrowDown class="size-4" />
          </button>
          <button aria-label={`Open ${props.post.commentCount ?? 0} comments`} class="inline-flex h-9 items-center gap-2 rounded-full border border-border-soft px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" type="button">
            <IconChatCircle class="size-4" />
            <span>{props.post.commentCount ?? 0}</span>
          </button>
        </>
      }>{controls => controls()}</Show>
      <Show when={props.post.learnAvailable}>
        <Button class="h-9 rounded-full px-4" size="sm" variant="secondary">Learn</Button>
      </Show>
      <Show when={props.post.karaokeAvailable}>
        <Button class="h-9 rounded-full px-4" size="sm">Karaoke</Button>
      </Show>
    </div>
  );
}

function SongPost(props: { post: CommunityPost }) {
  const progress = () => Math.max(0, Math.min(100, props.post.mediaProgress ?? 0));
  return (
    <div class="flex flex-col gap-3 rounded-xl border border-border-soft bg-muted/30 p-3">
      <div class="flex items-center gap-3">
        <div class="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
          <Show when={props.post.mediaSrc} fallback={<div class="grid size-full place-items-center"><IconMusicNote class="size-7 text-muted-foreground" /></div>}>
            {src => <img alt="" class="size-full object-cover" src={src()} />}
          </Show>
          <MediaControlButton aria-label={`Play ${props.post.mediaTitle ?? props.post.title}`} class="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2" size="sm">
            <IconPlay class="size-4" />
          </MediaControlButton>
        </div>
        <div class="min-w-0 flex-1">
          <Type class="block truncate" variant="body-strong">{props.post.mediaTitle ?? props.post.title}</Type>
          <Type class="block truncate" variant="caption">{props.post.mediaArtist ?? "Tame Impala"}</Type>
          <div class="mt-2 flex items-center gap-2">
            <div aria-label={`${progress()}% played`} class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border-soft" role="progressbar" aria-valuemax="100" aria-valuemin="0" aria-valuenow={progress()}>
              <div class="h-full rounded-full bg-primary" style={{ width: `${progress()}%` }} />
            </div>
            <Type variant="caption">{props.post.mediaDuration ?? "—"}</Type>
          </div>
        </div>
      </div>
      <Show when={props.post.rewardLabels?.length}>
        <div class="flex flex-wrap gap-2">
          <For each={props.post.rewardLabels}>{label => <span class="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary-text">{label}</span>}</For>
        </div>
      </Show>
    </div>
  );
}

function FeedPost(props: { post: CommunityPost; actions?: JSX.Element }) {
  const author = () => props.post.authorHandle ?? "midnightwaves.pirate";
  return (
    <article class="flex flex-col gap-3 border-b border-border-soft px-0 py-5 first:pt-0 last:border-b-0" data-community-post={props.post.id}>
      <div class="flex items-center gap-2">
        <CommunityAvatar
          avatarSrc={props.post.authorAvatarSrc}
          communityId={props.post.id}
          displayName={author()}
          size="xs"
        />
        <Type as="span" variant="label">{author()}</Type>
        <Type as="span" variant="caption">· {postTimestamp(props.post.publishedAt)}</Type>
        <IconButton aria-label={`More options for ${props.post.title}`} class="ms-auto size-8" variant="ghost">
          <IconDotsThree class="size-5" />
        </IconButton>
      </div>
      <Show when={props.post.kind === "song"} fallback={
        <>
          <Type variant="h3">{props.post.title}</Type>
          <Type variant="body">{props.post.body}</Type>
        </>
      }>
        <Show when={props.post.body}><Type variant="h3">{props.post.body}</Type></Show>
        <SongPost post={props.post} />
      </Show>
      <PostActions engagementControls={props.actions} post={props.post} />
    </article>
  );
}

function CommunityAbout(props: { community: CommunityData }) {
  const community = () => props.community;
  return (
    <div class="flex flex-col gap-4">
      <Card>
        <CardContent class="flex flex-col gap-3 p-5">
          <Type variant="h3">About {community().name}</Type>
          <Type variant="body">{community().description}</Type>
          <Separator />
          <Type variant="caption">{formatCount(community().members)} members · {formatCount(community().followers)} followers</Type>
          <Show when={community().gates?.length}>
            <Type variant="label">{gateSummary(community().gates ?? [], community().gateMode ?? "unknown")}</Type>
            <ul class="flex flex-col gap-2">
              <For each={community().gates}>{gate => <li class="flex items-center justify-between gap-3"><Type variant="body">{gate.label}</Type><Type variant="caption">{gate.status}</Type></li>}</For>
            </ul>
          </Show>
        </CardContent>
      </Card>
      <Show when={community().rules?.length}>
        <Card>
          <CardContent class="flex flex-col gap-4 p-5">
            <Type variant="h3">Community rules</Type>
            <ol class="flex flex-col gap-4">
              <For each={orderedCommunityRules(community().rules ?? [])}>
                {(rule, index) => <li class="flex gap-3"><span class="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{index() + 1}</span><div><Type variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></div></li>}
              </For>
            </ol>
          </CardContent>
        </Card>
      </Show>
      <Show when={community().referenceLinks?.length}>
        <Card>
          <CardContent class="flex flex-col gap-3 p-5">
            <Type variant="h3">Links</Type>
            <nav aria-label="Community reference links">
              <ul class="flex flex-col gap-2">
                <For each={orderedReferenceLinks(community().referenceLinks ?? [])}>
                  {link => <Show when={safeCommunityHref(link.href)}>{href => <li><a aria-label={`Open ${link.label}`} class="text-foreground underline underline-offset-4" href={href()} rel="noreferrer" target="_blank">{link.label}</a></li>}</Show>}
                </For>
              </ul>
            </nav>
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}

function CommunityBanner(props: { community: CommunityData; onBack?: () => void; onMore?: () => void }) {
  return (
    <div class="relative h-36 overflow-hidden bg-[linear-gradient(120deg,#162c32_0%,#5f746a_45%,#c7b68a_100%)] md:h-56">
      <Show when={props.community.bannerSrc}>
        {src => <img alt="" class="size-full object-cover" src={src()} />}
      </Show>
      <div class="absolute inset-x-0 top-0 flex items-center justify-between p-3 md:p-5">
        <IconButton aria-label="Go back" class="bg-background/75 text-foreground shadow-sm backdrop-blur-sm" onClick={props.onBack} variant="ghost">
          <IconArrowLeft class="size-5" />
        </IconButton>
        <IconButton aria-label="More community options" class="bg-background/75 text-foreground shadow-sm backdrop-blur-sm" onClick={props.onMore} variant="ghost">
          <IconDotsThree class="size-5" />
        </IconButton>
      </div>
    </div>
  );
}

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal("Best");
  const [tab, setTab] = createSignal<CommunityTab>("feed");
  const community = () => props.community;
  const sortedPosts = createMemo(() => {
    const requestedSort = sort().toLowerCase();
    // SAFETY: only the three controlled select values reach this branch; unknown values use the stable best default.
    const communitySort: CommunitySort = requestedSort === "new" ? "new" : requestedSort === "top" ? "top" : "best";
    return sortCommunityPosts(community().posts, communitySort);
  });
  const songs = createMemo(() => sortedPosts().filter(post => post.kind === "song"));
  const renderPost = (post: CommunityPost) => {
    const render = (actions?: JSX.Element) => <FeedPost actions={actions} post={post} />;
    return props.renderPost?.(post, render) ?? render();
  };

  return (
    <div class={props.mobile ? "w-full max-w-[24.375rem] bg-background" : "mx-auto w-full max-w-6xl bg-background"} data-community-page>
      <CommunityBanner community={community()} onBack={props.onBack} onMore={props.onMore} />

      <header class="relative border-b border-border-soft bg-background px-5 pb-5 md:px-8 md:pb-6">
        <div class="md:flex md:items-end md:gap-4">
          <div class="-mt-9 mb-3 md:-mt-11 md:mb-0">
            <CommunityAvatar
              avatarSrc={community().avatarSrc}
              class="size-20 border-4 border-background md:size-24"
              communityId={community().id ?? community().handle}
              displayName={community().name}
              size="lg"
            />
          </div>
          <div class="min-w-0 md:flex-1 md:pb-1">
            <Type as="h1" class="text-2xl md:text-3xl" variant="h1">{community().name}</Type>
            <Type class="mt-1 block" variant="caption">{community().handle} · {formatCount(community().members)} members · {formatCount(community().followers)} followers</Type>
          </div>
          <Show when={props.readOnly !== true}>
            <div class="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:shrink-0 md:flex-wrap" aria-label="Community actions">
              <Button class="w-full md:w-auto" disabled={props.followBusy} onClick={() => props.onFollowToggle?.()} variant={props.following ? "secondary" : "outline"}>{props.followBusy ? "Saving…" : props.following ? "Following" : "Follow"}</Button>
              <Show when={props.canJoin !== false}>
                <Button class="w-full md:w-auto" disabled={props.joined || props.joinBusy || props.joinDisabled} onClick={() => props.onJoin?.()} variant={props.joined ? "secondary" : "default"}>{props.joinBusy ? "Checking…" : props.joined ? "Joined" : props.joinLabel ?? "Join"}</Button>
              </Show>
              <Show when={props.joined || props.showCreatePost || props.onCreatePost !== undefined}>
                <Button
                  class="col-span-2 w-full md:w-auto"
                  disabled={props.createPostBusy}
                  leadingIcon={<IconPlus class="size-4" />}
                  onClick={() => props.onCreatePost?.()}
                >
                  {props.createPostBusy ? "Opening…" : "Post here"}
                </Button>
              </Show>
              <Show when={props.onManage}>
                <Button
                  class="col-span-2 w-full md:w-auto"
                  leadingIcon={<IconShield class="size-4" />}
                  onClick={() => props.onManage?.()}
                  variant="secondary"
                >Manage</Button>
              </Show>
            </div>
          </Show>
        </div>
        <Type class="mt-3 max-w-2xl md:hidden" variant="body">{community().description}</Type>
      </header>

      <FlatTabBar class="px-5 md:px-8" columns={4}>
        <FlatTabButton active={tab() === "feed"} onClick={() => setTab("feed")}>Feed</FlatTabButton>
        <FlatTabButton active={tab() === "songs"} onClick={() => setTab("songs")}>Songs</FlatTabButton>
        <FlatTabButton active={tab() === "leaderboard"} onClick={() => setTab("leaderboard")}>Leaderboard</FlatTabButton>
        <FlatTabButton active={tab() === "about"} onClick={() => setTab("about")}>About</FlatTabButton>
      </FlatTabBar>

      <div class="grid gap-8 p-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8">
        <main class={tab() === "about" ? "hidden md:block" : "min-w-0"} aria-label="Community feed">
          <Show when={tab() === "feed"}>
            <div class="mb-5 flex items-center justify-between gap-3">
              <Type variant="h2">Feed</Type>
              <label class="flex items-center gap-2">
                <Type as="span" class="sr-only" variant="label">Sort community feed</Type>
                <select aria-label="Sort community feed" class="h-9 rounded-full border border-border-soft bg-card px-3 text-sm" onChange={event => setSort(event.currentTarget.value)} value={sort()}>
                  <option value="Best">Best</option><option value="New">New</option><option value="Top">Top</option>
                </select>
              </label>
            </div>
            <Show when={props.personaControl}>
              <div class="mb-4 flex justify-end">{props.personaControl}</div>
            </Show>
            <Show when={!props.postsLoading} fallback={<Card><CardContent class="p-6"><Type aria-live="polite" role="status" variant="body">Loading community posts…</Type></CardContent></Card>}>
              <Show when={!props.postsError} fallback={<Card><CardContent class="p-6"><Type role="alert" variant="body">Community posts are temporarily unavailable.</Type></CardContent></Card>}>
                <Show when={!props.empty && sortedPosts().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}>
              <div class="flex flex-col">
                <For each={sortedPosts()}>{post => renderPost(post)}</For>
              </div>
                </Show>
              </Show>
            </Show>
          </Show>
          <Show when={tab() === "songs"}>
            <div class="mb-5"><Type variant="h2">Songs</Type></div>
            <Show when={songs().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No songs in this community yet.</Type></CardContent></Card>}>
              <div class="flex flex-col"><For each={songs()}>{post => renderPost(post)}</For></div>
            </Show>
          </Show>
          <Show when={tab() === "leaderboard"}>
            <div class="mb-5"><Type variant="h2">Leaderboard</Type></div>
            <Card><CardContent class="p-6"><Type variant="body">Earn points by sharing, learning, and singing with the community.</Type></CardContent></Card>
          </Show>
        </main>

        <aside class={tab() === "about" ? "flex flex-col gap-4" : "hidden md:block"} aria-label="Community information">
          <CommunityAbout community={community()} />
        </aside>
      </div>
    </div>
  );
}
