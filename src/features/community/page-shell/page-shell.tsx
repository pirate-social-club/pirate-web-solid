import { publicPostIdHref } from "../../posts/public-post/public-post-route.model.ts";
import { relativeTime } from "../../posts/shared-engagement/relative-time.ts";
import { EngagementControls } from "../../posts/shared-engagement/engagement-controls.tsx";
import { ContentOverflowMenu, type ContentAction } from "../../posts/shared-engagement/content-overflow-menu.tsx";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { SongPlayer } from "../../posts/song-player/song-player.tsx";
import { RewardSponsorAction } from "../../rewards/reward-sponsor-action.tsx";
/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Loading, Show, createMemo, createSignal } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CommunityAvatar,
  FlatTabBar,
  FlatTabButton,
  IconArrowLeft,
  IconDotsThree,
  IconMusicNote,
  IconPlus,
  IconShield,
  IconButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Type,
} from "@pirate/web-solid-ui";
import { CommunityFeedSort } from "./community-feed-sort.tsx";
import {
  membershipLine,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityData,
  type CommunityFeed,
  type CommunityPost,
  type CommunitySort,
} from "./page-shell-model";

export interface CommunityPageShellProps {
  community: CommunityData;
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
  createPostLabel?: string;
  onBack?: () => void;
  canJoin?: boolean;
  /**
   * The feed, read inside this shell's own loading boundary. Reading it may
   * suspend, which is why it is a function and not a value: the surrounding
   * chrome stays rendered while the region it belongs to waits.
   */
  feed?: () => CommunityFeed;
  onVerifyAge?: (signal: AbortSignal) => Promise<void>;
  /**
   * True while the viewer's session or membership is still settling. Controls
   * that depend on it hold their space without claiming what they do not know.
   */
  authorityPending?: boolean;
  /**
   * True while the viewer's membership was read and the read failed. The
   * controls stay actionable so a retry is possible, but they say only that
   * the state needs checking, never that the viewer is or is not a member.
   */
  viewerUnknown?: boolean;
  /**
   * True while management authority alone is still settling. Separate from
   * authorityPending, because a slow moderation read must not hold the follow,
   * join, post or persona controls that no longer depend on anything.
   */
  managePending?: boolean;
  /**
   * The open text composer replaces the feed in the main content column.
   * It stays in the page flow at every width.
   */
  composer?: () => JSX.Element;
  /** The viewer's own posts still being delivered, shown above the feed. */
  feedLead?: () => JSX.Element;
  /** How many entries the lead holds, so an empty feed is not called empty. */
  feedLeadCount?: number;
  /** Feed posts kept first whatever the sort, newest pin first. */
  pinnedPostIds?: readonly string[];
  renderPost?: (
    post: CommunityPost,
    render: (actions?: JSX.Element, menuActions?: readonly ContentAction[]) => JSX.Element,
  ) => JSX.Element;
}

type CommunityTab = "feed" | "songs" | "about";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}


function PostActions(props: { post: CommunityPost; engagementControls?: JSX.Element }) {
  return (
    <div class="flex flex-wrap items-center gap-2 pt-1" role="group" aria-label="Post actions">
      <Show when={props.engagementControls} fallback={
        <EngagementControls score={props.post.score} commentCount={props.post.commentCount ?? 0} />
      }>{controls => controls()}</Show>
    </div>
  );
}

function SongPost(props: { post: CommunityPost; titleHref?: string; nativeNavigation?: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border-soft bg-muted/30 p-3">
      <div class="relative size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
        <Show when={props.post.mediaSrc} fallback={<div class="grid size-full place-items-center"><IconMusicNote class="size-7 text-muted-foreground" /></div>}>
          {src => <img alt="" class="size-full object-cover" src={src()} />}
        </Show>
      </div>
      <div class="min-w-0 flex-1">
        <Type class="block truncate" variant="body-strong"><Show when={props.titleHref} fallback={props.post.mediaTitle ?? props.post.title}>{href => <a href={href()} rel={props.nativeNavigation ? "external" : undefined} class="hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">{props.post.mediaTitle ?? props.post.title}</a>}</Show></Type>
        {/* An unknown artist is left unsaid. The placeholder here named a
            real recording artist who has nothing to do with the post. */}
        <Show when={props.post.mediaArtist}>
          {artist => <Type class="block truncate" variant="caption">{artist()}</Type>}
        </Show>
      </div>
      <div class="relative z-10 shrink-0 has-[audio]:basis-full"><SongPlayer compact postId={props.post.id} title={props.post.mediaTitle ?? props.post.title} /></div>
    </div>
  );
}

export function CommunityPostCard(props: { post: CommunityPost; communityId?: string; titleHref?: string; nativeNavigation?: boolean; actions?: JSX.Element; menuActions?: readonly ContentAction[] }) {
  // The feed adapter always resolves a handle, including "Anonymous" and a
  // generic public label. This covers a caller that supplied none, and says so
  // rather than attributing the post to an invented account.
  const author = () => props.post.authorHandle ?? "Unknown author";
  return (
    <article class="relative flex flex-col gap-3 border-b border-border-soft px-0 py-5 first:pt-0 last:border-b-0" data-community-post={props.post.id}>
      <div class="flex items-center gap-2">
        <CommunityAvatar
          avatarSrc={props.post.authorAvatarSrc}
          communityId={props.post.id}
          displayName={author()}
          size="xs"
        />
        <Type as="span" variant="label">{author()}</Type>
        <Show when={relativeTime(props.post.publishedAt)}>{timestamp => <Type as="span" variant="caption">· {timestamp()}</Type>}</Show>
        <div class="relative z-10 ml-auto"><ContentOverflowMenu label="Post options" actions={props.menuActions} /></div>
        <Show when={props.post.kind === "song" && props.communityId}>
          {communityId => <div class="relative z-10 ml-auto"><RewardSponsorAction communityId={communityId()} postId={props.post.id} songTitle={props.post.mediaTitle ?? props.post.title} /></div>}
        </Show>
      </div>
      <Show when={props.post.kind === "song"} fallback={
        <>
          <Type variant="h3"><Show when={props.titleHref} fallback={props.post.title}>{href => <a href={href()} aria-label={props.post.title.trim() ? undefined : props.post.body.trim().replace(/\s+/gu, " ").slice(0, 120) || "Open post"} rel={props.nativeNavigation ? "external" : undefined} class="hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">{props.post.title}</a>}</Show></Type>
          <Type variant="body">{props.post.body}</Type>
        </>
      }>
        {/* The card names the song and the player plays it; a body that only
            repeats the song title is not commentary and is not shown. */}
        <Show when={props.post.body && props.post.body !== (props.post.mediaTitle ?? props.post.title)}>
          <Type variant="body">{props.post.body}</Type>
        </Show>
        <SongPost post={props.post} titleHref={props.titleHref} nativeNavigation={props.nativeNavigation} />
      </Show>
      <div class={props.titleHref ? "relative z-10 w-fit max-w-full" : undefined}><PostActions engagementControls={props.actions} post={props.post} /></div>
    </article>
  );
}

function FeedPending() {
  return (
    <Card>
      <CardContent class="p-6">
        <Type aria-live="polite" role="status" variant="body">Loading community posts…</Type>
      </CardContent>
    </Card>
  );
}

function CommunityAbout(props: { community: CommunityData }) {
  const community = () => props.community;
  return (
    <div class="flex flex-col gap-4 max-md:gap-8">
      <Card class="max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <CardContent class="flex flex-col gap-3 p-5 max-md:p-0">
          <Type variant="h3">About</Type>
          <Type variant="body">{community().description}</Type>
          <Show when={community().handle}>
            {handle => <Type variant="caption">{handle()}</Type>}
          </Show>
          <Show when={membershipLine(community().membershipMode)}>
            {line => <Type variant="caption">{line()}</Type>}
          </Show>
        </CardContent>
      </Card>
      <Show when={community().rules?.length}>
        <Card class="max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardContent class="flex flex-col gap-4 p-5 max-md:p-0">
            <Type variant="h3">Community rules</Type>
            <ol class="flex flex-col gap-4">
              <For each={orderedCommunityRules(community().rules ?? [])}>
                {(rule, index) => <li class="flex gap-3"><span class="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{index() + 1}</span><div class="flex flex-col gap-0.5"><Type variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></div></li>}
              </For>
            </ol>
          </CardContent>
        </Card>
      </Show>
      <Show when={community().referenceLinks?.length}>
        <Card class="max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardContent class="flex flex-col gap-3 p-5 max-md:p-0">
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

function CommunityBanner(props: {
  community: CommunityData;
  /** Reported on the trigger so a surface can read it without opening it. */
  manage: "available" | "pending" | "unavailable";
  onBack?: () => void;
  onManage?: () => void;
  /** Feed sort, rendered left of the overflow menu when the shell has one. */
  sortControl?: JSX.Element;
}) {
  return (
    <div class="relative h-36 overflow-hidden bg-[linear-gradient(120deg,#162c32_0%,#5f746a_45%,#c7b68a_100%)] md:h-56">
      <Show when={props.community.bannerSrc}>
        {src => <img alt="" class="size-full object-cover" src={src()} />}
      </Show>
      {/* The scrim darkens the lower cover so the overlay controls stay
          readable over a light or busy image. */}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45" />
      <div class="absolute inset-x-0 top-0 flex items-center justify-between px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:p-5">
        <IconButton aria-label="Go back" class="bg-background/75 text-foreground shadow-sm backdrop-blur-sm" onClick={props.onBack} variant="ghost">
          <IconArrowLeft class="size-5" />
        </IconButton>
        <div class="flex items-center gap-2">
          {props.sortControl}
          {/* An overlay, so the sort holds its place while authority settles:
              a same-size, non-interactive placeholder holds the trigger's spot
              on first paint, the real menu appears only for a manager, and
              everyone else gets nothing. */}
          <Show when={props.onManage !== undefined} fallback={
            <Show when={props.manage === "pending"}>
              <div aria-hidden="true" class="invisible size-10" data-community-manage="pending" />
            </Show>
          }>
            <DropdownMenu placement="bottom-end" gutter={4}>
              <DropdownMenuTrigger
                aria-label="More community options"
                class="grid size-10 place-items-center rounded-full bg-background/75 text-foreground shadow-sm backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-community-manage="available"
              >
                <IconDotsThree class="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-56">
                <DropdownMenuItem onSelect={() => props.onManage?.()}>
                  <IconShield class="size-4" />
                  <span>Manage community</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal("Best");
  const [tab, setTab] = createSignal<CommunityTab>("feed");
  const community = () => props.community;
  // Reading this is what suspends; a host that passes no feed has its posts
  // already in hand, so nothing waits.
  // Both header slots are this size in every state, so a label change cannot
  // resize them and a viewport change cannot make them wrap.
  const slotClass = "h-11 w-full min-w-0 md:w-32";
  const confirmedMember = () => props.joined && !props.authorityPending && !props.viewerUnknown;
  const feed = (): CommunityFeed =>
    props.feed?.() ?? { kind: "ready", posts: community().posts };
  const hasAgeLocks = () => { const current = feed(); return current.kind === "ready" && (current.ageLockedCount ?? 0) > 0; };
  const agePrompt = () => <Show when={hasAgeLocks() && props.onVerifyAge}>{verify => <AgeAccessPrompt onVerified={verify()} />}</Show>;
  /**
   * What each viewer control says, and what it says to a screen reader. A
   * pending control reports that it is checking; a control whose read failed
   * asks to check again. Neither reports a membership or a follow direction.
   */
  const followLabel = () => {
    if (props.followBusy) return { text: "Saving…", description: "Saving your follow" };
    if (props.authorityPending) return { text: "Checking…", description: "Checking your follow state" };
    if (props.viewerUnknown) return { text: "Check follow", description: "Check your follow state again" };
    return props.following
      ? { text: "Following", description: "Unfollow this community" }
      : { text: "Follow", description: "Follow this community" };
  };
  const joinLabel = () => {
    if (props.authorityPending || props.joinBusy) {
      return { text: "Checking…", description: "Checking your membership" };
    }
    if (props.viewerUnknown) return { text: "Check membership", description: "Check your membership again" };
    if (props.joined) return { text: "Joined", description: "You are a member of this community" };
    return { text: props.joinLabel ?? "Join", description: props.joinLabel ?? "Join this community" };
  };
  const feedPosts = () => {
    const current = feed();
    return current.kind === "ready" ? current.posts : [];
  };
  const sortedPosts = createMemo(() => {
    const requestedSort = sort().toLowerCase();
    // SAFETY: only the three controlled select values reach this branch; unknown values use the stable best default.
    const communitySort: CommunitySort = requestedSort === "new" ? "new" : requestedSort === "top" ? "top" : "best";
    const sorted = sortCommunityPosts(feedPosts(), communitySort);
    const pinned = props.pinnedPostIds ?? [];
    if (pinned.length === 0) return sorted;
    const first = pinned.flatMap(id => sorted.filter(post => post.id === id));
    return [...first, ...sorted.filter(post => !pinned.includes(post.id))];
  });
  const songs = createMemo(() => sortedPosts().filter(post => post.kind === "song"));
  const renderPost = (post: CommunityPost) => {
    // The ID route redirects to the API-owned thread. Native navigation keeps
    // router preloading from starting a competing redirect.
    const render = (actions?: JSX.Element, menuActions?: readonly ContentAction[]) => <CommunityPostCard actions={actions} menuActions={menuActions} communityId={props.community.id} post={post} titleHref={publicPostIdHref(post.id)} nativeNavigation />;
    return props.renderPost?.(post, render) ?? render();
  };
  // Keep this owned subtree stable for SSR hydration key allocation.
  const sortControl = createMemo(() => <CommunityFeedSort value={sort()} onChange={setSort} />);

  return (
    <div class="mx-auto w-full max-w-6xl bg-background" data-community-page data-composing={props.composer ? "true" : undefined}>
      {/* On a phone, writing is the whole screen: the banner and the community
          header give way to the composer's own action bar. Desktop keeps them
          beside the form, as accepted on 2026-10-07. */}
      <div class={props.composer ? "max-md:hidden" : "contents"} data-community-chrome>
      <CommunityBanner
        community={community()}
        manage={props.onManage !== undefined
          ? "available"
          : (props.managePending ?? props.authorityPending) ? "pending" : "unavailable"}
        onBack={props.onBack}
        onManage={props.onManage}
        sortControl={props.composer || tab() === "about" ? undefined : sortControl()}
      />

      <header class="relative bg-background px-5 pb-5 pt-5 md:px-8 md:pb-6 md:pt-6">
        <div class="md:flex md:items-center md:gap-4">
          <div class="min-w-0 md:flex-1">
            {/* The avatar sits below the banner rather than overlapping it, and
                the title and counts are centered against it. */}
            <div class="flex min-w-0 items-center gap-3 md:gap-4">
              <div class="shrink-0">
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  class="size-20 border-4 border-background md:size-24"
                  communityId={community().id ?? community().handle}
                  displayName={community().name}
                  size="lg"
                />
              </div>
              <div class="min-w-0 flex-1">
                <Type as="h1" class="line-clamp-2 text-2xl md:text-3xl" variant="h1">{community().name}</Type>
                <Type class="mt-1 block truncate" variant="caption">
                  {formatCount(community().members)} members<span class="hidden md:inline"> · {formatCount(community().followers)} followers</span>
                  <span class={confirmedMember() ? "" : "invisible"} data-community-membership-status aria-hidden={confirmedMember() ? undefined : "true"}> · Member</span>
                </Type>
              </div>
            </div>
            {/* Full width above the actions on phones, with equal space above
                and below. Desktop keeps the description in the About card. */}
            <div class="mt-4 md:hidden">
              <Type variant="body">{community().description}</Type>
            </div>
          </div>
          {/* The reserved group keeps its size while authority settles. A
              member gets one useful command spanning the two visitor slots. */}
          <div
            aria-label="Community actions"
            class={props.composer ? "hidden" : "mt-4 grid h-11 grid-cols-2 gap-3 md:mt-0 md:w-[16.75rem] md:shrink-0"}
            data-community-actions-reserved
            role="group"
          >
            <Show when={confirmedMember()} fallback={
              <>
                <Button
                  aria-label={followLabel().description}
                  class={slotClass}
                  data-community-follow-slot
                  disabled={props.followBusy || props.authorityPending}
                  loading={props.followBusy || props.authorityPending}
                  onClick={() => props.onFollowToggle?.()}
                  variant={props.following ? "secondary" : "outline"}
                ><span class={props.followBusy || props.authorityPending ? "sr-only" : "truncate"}>{followLabel().text}</span></Button>
                <Show when={props.canJoin !== false} fallback={<div class={slotClass} aria-hidden="true" />}>
                  <Show when={props.joinDisabled && !props.authorityPending && !props.viewerUnknown && !props.joinBusy} fallback={
                    <Button
                      aria-label={joinLabel().description}
                      class={slotClass}
                      data-community-membership-slot
                      disabled={props.authorityPending || props.joinBusy}
                      loading={props.authorityPending || props.joinBusy}
                      onClick={() => props.onJoin?.()}
                    ><span class={props.authorityPending || props.joinBusy ? "sr-only" : "truncate"}>{joinLabel().text}</span></Button>
                  }>
                    <div class={`${slotClass} flex items-center justify-center`} data-community-membership-slot role="status">
                      <Type variant="caption" class="truncate">{props.joinLabel ?? "Unavailable"}</Type>
                    </div>
                  </Show>
                </Show>
              </>
            }>
              <Button
                class="col-span-2 h-11 w-full min-w-0"
                data-community-post-slot
                disabled={props.createPostBusy || props.composer !== undefined}
                loading={props.createPostBusy}
                leadingIcon={<IconPlus class="size-4" />}
                onClick={() => { setTab("feed"); props.onCreatePost?.(); }}
              >{props.createPostBusy ? "Opening…" : props.createPostLabel ?? "Post"}</Button>
            </Show>
          </div>
        </div>
      </header>
      </div>

      <Show when={!props.composer}>
        <div data-community-tabs>
        <FlatTabBar class="px-5 md:px-8" columns={3}>
        <FlatTabButton active={tab() === "feed"} onClick={() => setTab("feed")}>Feed</FlatTabButton>
        <FlatTabButton active={tab() === "songs"} onClick={() => setTab("songs")}>Songs</FlatTabButton>
        <FlatTabButton active={tab() === "about"} onClick={() => setTab("about")}>About</FlatTabButton>
        </FlatTabBar>
        </div>
      </Show>

      <div class={props.composer ? "grid gap-8 px-4 pb-6 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8" : "grid gap-8 p-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8"}>
        {/* About is a view at every width. It used to be a mobile-only tab:
            at desktop the main column came back through md:block and rendered
            nothing, so asking for the community's details replaced the feed
            with a blank column beside an aside that was already there. */}
        <main class={!props.composer && tab() === "about" ? "hidden" : "min-w-0"} aria-label={props.composer ? "Create a post" : "Community feed"}>
          <Show when={props.composer} fallback={<>
          <Show when={tab() === "feed"}>
            <Show when={props.feedLead}>{lead => <div class="flex flex-col" data-community-feed-lead>{lead()()}</div>}</Show>
            <Loading fallback={<FeedPending />}>
              <Show when={feed().kind === "ready"} fallback={<Card><CardContent class="p-6"><Type role="alert" variant="body">Community posts are temporarily unavailable.</Type></CardContent></Card>}>
                {agePrompt()}
                <Show when={sortedPosts().length > 0 || hasAgeLocks() || (props.feedLeadCount ?? 0) > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}>
                  <div class={(props.feedLeadCount ?? 0) > 0 ? "flex flex-col pt-5" : "flex flex-col"}>
                    <For each={sortedPosts()}>{post => renderPost(post)}</For>
                  </div>
                </Show>
              </Show>
            </Loading>
          </Show>
          <Show when={tab() === "songs"}>
            <Loading fallback={<FeedPending />}>
              {agePrompt()}
              <Show when={songs().length > 0 || hasAgeLocks()} fallback={<Card><CardContent class="p-6"><Type variant="body">No songs in this community yet.</Type></CardContent></Card>}>
                <div class="flex flex-col"><For each={songs()}>{post => renderPost(post)}</For></div>
              </Show>
            </Loading>
          </Show>
          </>}>{composer => composer()()}</Show>
        </main>

        {/* Community information remains beside the main content on desktop. */}
        <aside
          aria-label="Community information"
          class={!props.composer && tab() === "about"
            ? "flex flex-col gap-4 md:col-span-2 md:max-w-3xl"
            : "max-md:contents md:flex md:min-w-0 md:flex-col md:gap-4"}
        >
          <div class={!props.composer && tab() === "about" ? "contents" : "hidden md:block"} data-community-about>
            <CommunityAbout community={community()} />
          </div>
        </aside>
      </div>
    </div>
  );
}
