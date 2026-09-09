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
  IconArrowUp,
  IconChatCircle,
  IconDotsThree,
  IconMusicNote,
  IconPlay,
  IconPlus,
  IconShield,
  IconButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  MediaControlButton,
  Separator,
  cn,
  Type,
} from "@pirate/web-solid-ui";
import {
  gateSummary,
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
  /**
   * The feed, read inside this shell's own loading boundary. Reading it may
   * suspend, which is why it is a function and not a value: the surrounding
   * chrome stays rendered while the region it belongs to waits.
   */
  feed?: () => CommunityFeed;
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
      {/* No engagement controls means no viewer who can act: the page has no
          resolved posting session. These were three buttons with no handlers
          behind them, which offered actions that could never happen. They are
          the standing counts instead, and a viewer who signs in gets the real
          controls in their place. */}
      <Show when={props.engagementControls} fallback={
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-post-counts>
          <span class="inline-flex h-9 items-center gap-1 rounded-full border border-border-soft px-3">
            <IconArrowUp class="size-4" aria-hidden="true" />
            <span>{props.post.score}</span>
            <span class="sr-only">points</span>
          </span>
          <span class="inline-flex h-9 items-center gap-2 rounded-full border border-border-soft px-3">
            <IconChatCircle class="size-4" aria-hidden="true" />
            <span>{props.post.commentCount ?? 0}</span>
            <span class="sr-only">comments</span>
          </span>
        </div>
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
          {/* An unknown artist is left unsaid. The placeholder here named a
              real recording artist who has nothing to do with the post. */}
          <Show when={props.post.mediaArtist}>
            {artist => <Type class="block truncate" variant="caption">{artist()}</Type>}
          </Show>
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
  // The feed adapter always resolves a handle, including "Anonymous" and a
  // generic public label. This covers a caller that supplied none, and says so
  // rather than attributing the post to an invented account.
  const author = () => props.post.authorHandle ?? "Unknown author";
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

function CommunityBanner(props: {
  community: CommunityData;
  /** Reported on the trigger so a surface can read it without opening it. */
  manage: "available" | "pending" | "unavailable";
  onBack?: () => void;
  onManage?: () => void;
  onShowDetails: () => void;
}) {
  return (
    <div class="relative h-36 overflow-hidden bg-[linear-gradient(120deg,#162c32_0%,#5f746a_45%,#c7b68a_100%)] md:h-56">
      <Show when={props.community.bannerSrc}>
        {src => <img alt="" class="size-full object-cover" src={src()} />}
      </Show>
      <div class="absolute inset-x-0 top-0 flex items-center justify-between p-3 md:p-5">
        <IconButton aria-label="Go back" class="bg-background/75 text-foreground shadow-sm backdrop-blur-sm" onClick={props.onBack} variant="ghost">
          <IconArrowLeft class="size-5" />
        </IconButton>
        {/* An overlay, so an option that appears when authority settles moves
            nothing on the page beneath it. */}
        <DropdownMenu placement="bottom-end" gutter={4}>
          <DropdownMenuTrigger
            aria-label="More community options"
            class="grid size-10 place-items-center rounded-full bg-background/75 text-foreground shadow-sm backdrop-blur-sm"
            data-community-manage={props.manage}
          >
            <IconDotsThree class="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-56">
            <Show when={props.onManage}>
              <DropdownMenuItem onSelect={() => props.onManage?.()}>
                <IconShield class="size-4" />
                <span>Manage</span>
              </DropdownMenuItem>
            </Show>
            {/* Always does something: a host that owns this navigation takes it,
                and otherwise it selects the About tab, which is where the
                community's details already live. */}
            <DropdownMenuItem onSelect={() => props.onShowDetails()}>Community details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  /**
   * Spec 016 §4.6: an active member may invoke follow idempotently but may not
   * unfollow, and has nothing left to join. Offering either would be offering
   * an action the server answers with a typed conflict. The row is a fixed
   * height, so withdrawing them moves nothing.
   */
  const memberHasNoAction = () => props.joined === true && props.viewerUnknown !== true;
  const feed = (): CommunityFeed =>
    props.feed?.() ?? { kind: "ready", posts: community().posts };
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
    return sortCommunityPosts(feedPosts(), communitySort);
  });
  const songs = createMemo(() => sortedPosts().filter(post => post.kind === "song"));
  const renderPost = (post: CommunityPost) => {
    const render = (actions?: JSX.Element) => <FeedPost actions={actions} post={post} />;
    return props.renderPost?.(post, render) ?? render();
  };

  return (
    <div class={props.mobile ? "w-full max-w-[24.375rem] bg-background" : "mx-auto w-full max-w-6xl bg-background"} data-community-page>
      <CommunityBanner
        community={community()}
        manage={props.onManage !== undefined
          ? "available"
          : (props.managePending ?? props.authorityPending) ? "pending" : "unavailable"}
        onBack={props.onBack}
        onManage={props.onManage}
        onShowDetails={() => {
          if (props.onMore !== undefined) props.onMore();
          else setTab("about");
        }}
      />

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
            <Type class="mt-1 block" variant="caption">
              <Show when={community().handle}>{handle => <>{handle()} · </>}</Show>
              {formatCount(community().members)} members · {formatCount(community().followers)} followers
            </Type>
          </div>
          <Show when={props.readOnly !== true}>
            {/* Exactly two slots, both always present and both a fixed size,
                so no label this row can show changes its geometry. Controls
                whose existence depends on authority live outside the header. */}
            <div
              aria-label="Community actions"
              class="mt-3 grid h-11 grid-cols-2 gap-2 md:mt-0 md:flex md:shrink-0"
              data-community-actions-reserved
            >
              {/* Follow and Following both state a direction that has not been
                  read yet, so neither is offered until it has been. */}
              <Show when={!memberHasNoAction()}>
                <Button
                  aria-label={followLabel().description}
                  class={slotClass}
                  data-community-follow-slot
                  disabled={props.followBusy || props.authorityPending}
                  onClick={() => props.onFollowToggle?.()}
                  variant={props.following ? "secondary" : "outline"}
                ><span class="truncate">{followLabel().text}</span></Button>
              <Show when={props.canJoin !== false} fallback={<div class={slotClass} aria-hidden="true" />}>
                <Button
                  aria-label={joinLabel().description}
                  class={slotClass}
                  data-community-membership-slot
                  disabled={props.authorityPending || props.joinBusy
                    || (!props.viewerUnknown && (props.joined || props.joinDisabled))}
                  onClick={() => props.onJoin?.()}
                  variant={props.joined && !props.viewerUnknown ? "secondary" : "default"}
                ><span class="truncate">{joinLabel().text}</span></Button>
              </Show>
              </Show>
            </div>
          </Show>
        </div>
        <Type class="mt-3 max-w-2xl md:hidden" variant="body">{community().description}</Type>
      </header>

      <div data-community-tabs>
      <FlatTabBar class="px-5 md:px-8" columns={4}>
        <FlatTabButton active={tab() === "feed"} onClick={() => setTab("feed")}>Feed</FlatTabButton>
        <FlatTabButton active={tab() === "songs"} onClick={() => setTab("songs")}>Songs</FlatTabButton>
        <FlatTabButton active={tab() === "leaderboard"} onClick={() => setTab("leaderboard")}>Leaderboard</FlatTabButton>
        <FlatTabButton active={tab() === "about"} onClick={() => setTab("about")}>About</FlatTabButton>
      </FlatTabBar>
      </div>

      <div class="grid gap-8 p-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8">
        {/* About is a view at every width. It used to be a mobile-only tab:
            at desktop the main column came back through md:block and rendered
            nothing, so asking for the community's details replaced the feed
            with a blank column beside an aside that was already there. */}
        <main class={tab() === "about" ? "hidden" : "min-w-0"} aria-label="Community feed">
          <Show when={tab() === "feed"}>
            <div class="mb-5 flex h-9 items-center justify-between gap-3">
              <Type variant="h2">Feed</Type>
              <div class="flex items-center gap-2">
              <Show when={props.joined || props.showCreatePost || props.onCreatePost !== undefined}>
                <Button
                  class="h-9 rounded-full px-4"
                  disabled={props.createPostBusy}
                  leadingIcon={<IconPlus class="size-4" />}
                  onClick={() => props.onCreatePost?.()}
                  size="sm"
                >
                  {props.createPostBusy ? "Opening…" : "Post"}
                </Button>
              </Show>
              <label class="flex items-center gap-2">
                <Type as="span" class="sr-only" variant="label">Sort community feed</Type>
                <select aria-label="Sort community feed" class="h-9 rounded-full border border-border-soft bg-card px-3 text-sm" onChange={event => setSort(event.currentTarget.value)} value={sort()}>
                  <option value="Best">Best</option><option value="New">New</option><option value="Top">Top</option>
                </select>
              </label>
              </div>
            </div>
            <div class="mb-4 flex h-9 items-center justify-end" data-community-persona-reserved>
              {props.personaControl}
            </div>
            <Loading fallback={<FeedPending />}>
              <Show when={feed().kind === "ready"} fallback={<Card><CardContent class="p-6"><Type role="alert" variant="body">Community posts are temporarily unavailable.</Type></CardContent></Card>}>
                <Show when={!props.empty && sortedPosts().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}>
                  <div class="flex flex-col">
                    <For each={sortedPosts()}>{post => renderPost(post)}</For>
                  </div>
                </Show>
              </Show>
            </Loading>
          </Show>
          <Show when={tab() === "songs"}>
            <div class="mb-5"><Type variant="h2">Songs</Type></div>
            <Loading fallback={<FeedPending />}>
              <Show when={songs().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No songs in this community yet.</Type></CardContent></Card>}>
                <div class="flex flex-col"><For each={songs()}>{post => renderPost(post)}</For></div>
              </Show>
            </Loading>
          </Show>
          <Show when={tab() === "leaderboard"}>
            <div class="mb-5"><Type variant="h2">Leaderboard</Type></div>
            <Card><CardContent class="p-6"><Type variant="body">Earn points by sharing, learning, and singing with the community.</Type></CardContent></Card>
          </Show>
        </main>

        <aside
          aria-label="Community information"
          class={tab() === "about"
            ? "flex flex-col gap-4 md:col-span-2 md:max-w-3xl"
            : "hidden md:block"}
        >
          <CommunityAbout community={community()} />
        </aside>
      </div>
    </div>
  );
}
