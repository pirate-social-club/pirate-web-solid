import { MegapotPoolSummary } from "../../rewards/megapot-participant.tsx";
import { publicPostIdHref } from "../../posts/public-post/public-post-route.model.ts";
import { usePageUiLocale } from "../../../lib/ui-locale.tsx";
import { publicProfileHref, publicProfileLabel } from "../../identity/public-profile-label.ts";
import { compactRelativeTime } from "../../posts/shared-engagement/relative-time.ts";
import { EngagementControls } from "../../posts/shared-engagement/engagement-controls.tsx";
import { ContentOverflowMenu, type ContentAction } from "../../posts/shared-engagement/content-overflow-menu.tsx";
import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import { SongPlayer } from "../../posts/song-player/song-player.tsx";
import { VideoPlayer } from "../../posts/video-submission/video-player.tsx";
import { RewardSponsorDialog } from "../../rewards/reward-sponsor-dialog.tsx";
import { useRewardServiceAvailability } from "../../rewards/reward-service-availability.tsx";
/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Loading, Show, createEffect, createMemo, createSignal } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CommunityAvatar,
  createMediaQuery,
  FlatTabBar,
  FlatTabButton,
  IconArrowLeft,
  IconMusicNote,
  IconButton,
  Type,
} from "@pirate/web-solid-ui";
import { CommunityFeedSort } from "./community-feed-sort.tsx";
import { CommunityMoreMenu, shareCommunityLink, type CommunityManageAuthority, type CommunityMoreAction } from "./community-more-menu.tsx";
import {
  membershipLine,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityData,
  type CommunityFeed,
  type CommunityPost,
  type CommunityVideoPost,
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
  /**
   * The viewer's profile for this community, drawn as a round button in the
   * banner beside More. The host owns what it opens.
   */
  profileControl?: JSX.Element;
  /** The community's public address for Share; the current page when absent. */
  shareUrl?: string;
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
  /** Server-backed activity summary supplied by the owning activity lane. */
  activitySummary?: () => JSX.Element;
  /** Feed posts kept first whatever the sort, newest pin first. */
  pinnedPostIds?: readonly string[];
  renderPost?: (
    post: CommunityPost,
    render: (actions?: JSX.Element, menuActions?: readonly ContentAction[]) => JSX.Element,
  ) => JSX.Element;
}

type CommunityTab = "feed" | "songs" | "about";

/** The lift Paper gives the header's primary action (Join, Post). */
const primaryShadowClass = "shadow-[0_8px_22px_#0000000F]";

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

function SongPost(props: { post: CommunityPost; titleHref?: string; nativeNavigation?: boolean; isolatePlayback?: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-xl border border-border-soft bg-muted p-3">
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
          {artist => <Type class="block truncate text-sm" variant="caption">{artist()}</Type>}
        </Show>
      </div>
      <div class="relative z-10 shrink-0 has-[audio]:basis-full"><SongPlayer compact postId={props.post.id} title={props.post.mediaTitle ?? props.post.title} cacheAccess={props.isolatePlayback ? false : undefined} /></div>
    </div>
  );
}

/**
 * A video post's poster in a fixed 9:16 frame. The frame sits above the
 * card's link overlay so the player keeps its own controls, and it waits for
 * a tap: a feed card never starts sound on its own. The soundtrack
 * line is the referenced song as the server projects it, and it steps aside
 * while the video plays so it never covers the native controls.
 */
function VideoPost(props: { post: CommunityVideoPost }) {
  return (
    <div class="group/video relative z-10 aspect-[9/16] w-[252px] max-w-full overflow-hidden rounded-xl bg-muted" data-community-video={props.post.id}>
      <VideoPlayer activation="manual" layout="card" postId={props.post.id} requiresAgeVerification={props.post.requiresAgeVerification} state={props.post.video} />
      <Show when={props.post.mediaTitle}>
        {title => <span class="pointer-events-none absolute inset-x-3 bottom-3 truncate text-sm text-white/85 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)] group-has-[[data-video-player-playing=true]]/video:hidden group-has-[[data-video-player-state=unavailable]]/video:hidden">{title()}</span>}
      </Show>
    </div>
  );
}

/**
 * A feed list of post cards. Cards may arrive wrapped (engagement controllers
 * wrap each one), so the first card's top padding and the last card's divider
 * are decided by the card's position in the list, not by `first:`/`last:` on
 * the card, which would see every wrapped card as both first and last.
 */
export const communityFeedListClass = "flex flex-col [&>*:first-child_[data-community-post]]:pt-0 [&>[data-community-post]:first-child]:pt-0 [&>*:last-child_[data-community-post]]:border-b-0 [&>[data-community-post]:last-child]:border-b-0";

export function CommunityPostCard(props: {
  post: CommunityPost; communityId?: string; titleHref?: string; nativeNavigation?: boolean; actions?: JSX.Element; menuActions?: readonly ContentAction[]; flush?: boolean;
  /**
   * The post page's own post: the title is the page's heading and the body
   * keeps its line breaks. Feed cards leave this off and are unchanged.
   */
  detail?: boolean;
  /** Private targeted routes discard playback grants with their route owner. */
  isolatePlayback?: boolean;
}) {
  const locale = usePageUiLocale();
  // Capability changes must synchronously retire an open sponsor dialog.
  const [boosting, setBoosting] = createSignal(false, { ownedWrite: true });
  const rewardsAvailable = useRewardServiceAvailability();
  createEffect(rewardsAvailable, available => { if (!available) setBoosting(false); });
  let card: HTMLElement | undefined;
  // The dialog opens from a menu item that no longer exists once the menu
  // closes, so the card returns focus to the menu trigger that led there.
  const closeBoost = () => {
    setBoosting(false);
    setTimeout(() => card?.querySelector<HTMLElement>('[aria-label="Post options"]')?.focus(), 0);
  };
  // Service availability only exposes the entry point. The server separately
  // checks the financial brake and authorization for every reward operation.
  const menuActions = (): readonly ContentAction[] | undefined => {
    const communityId = props.communityId;
    if (!rewardsAvailable() || props.post.kind !== "song" || !communityId) return props.menuActions;
    return [...(props.menuActions ?? []), { label: "Boost", run: () => { if (rewardsAvailable()) setBoosting(true); } }];
  };
  const author = () => props.post.authorProfile !== undefined
    ? publicProfileLabel(props.post.authorProfile, locale, props.post.authorPublicHandle)
    : props.post.authorHandle ?? "Unknown author";
  return (
    <article class={props.flush ? "relative flex flex-col gap-3" : "relative flex flex-col gap-3 border-b border-border-soft py-5"} data-community-post={props.post.id} ref={card}>
      <div class="flex items-center gap-2">
        <CommunityAvatar
          avatarSrc={props.post.authorAvatarSrc}
          communityId={props.post.authorPersonaId ?? props.post.id}
          displayName={author()}
          size="xs"
        />
        <Type as="span" class="min-w-0 truncate text-sm leading-5" variant="label"><Show when={publicProfileHref(props.post.authorPersonaId)} fallback={author()}>{href => <a href={href()} class="relative z-10 hover:underline">{author()}</a>}</Show></Type>
        <Show when={compactRelativeTime(props.post.publishedAt)}>{age => <Type as="span" class="shrink-0 text-sm" variant="caption"><time datetime={props.post.publishedAt} title={new Date(props.post.publishedAt).toUTCString()}>{age()}</time></Type>}</Show>
        <div class="relative z-10 ml-auto flex shrink-0 items-center"><ContentOverflowMenu inline label="Post options" actions={menuActions()} /></div>
      </div>
      <Show when={rewardsAvailable() && boosting() && props.communityId}>
        {communityId => <RewardSponsorDialog communityId={communityId()} postId={props.post.id} songTitle={props.post.mediaTitle ?? props.post.title} onClose={closeBoost} />}
      </Show>
      <Show when={props.post.kind === "video"}>
        <Show when={props.post.body.trim()}>
          {body => <Type variant="body"><Show when={props.titleHref} fallback={body()}>{href => <a href={href()} rel={props.nativeNavigation ? "external" : undefined} class="hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">{body()}</a>}</Show></Type>}
        </Show>
        <Show when={!props.post.body.trim() && props.titleHref}>
          {href => <a class="sr-only" href={href()} rel={props.nativeNavigation ? "external" : undefined}>Open video post</a>}
        </Show>
        <Show when={props.post.kind === "video" ? props.post : undefined}>{video => <VideoPost post={video()} />}</Show>
      </Show>
      <Show when={props.post.kind !== "video"}>
      <Show when={props.post.kind === "song"} fallback={
        <>
          <Type as={props.detail ? "h1" : undefined} class={props.detail ? "break-words leading-7" : undefined} variant="h3"><Show when={props.titleHref} fallback={props.post.title}>{href => <a href={href()} aria-label={props.post.title.trim() ? undefined : props.post.body.trim().replace(/\s+/gu, " ").slice(0, 120) || "Open post"} rel={props.nativeNavigation ? "external" : undefined} class="hover:underline after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">{props.post.title}</a>}</Show></Type>
          <Show when={!props.detail || props.post.body.trim()}>
            <Type as={props.detail ? "p" : undefined} class={props.detail ? "whitespace-pre-wrap break-words" : undefined} variant="body">{props.post.body}</Type>
          </Show>
        </>
      }>
        {/* The card names the song and the player plays it; a body that only
            repeats the song title is not commentary and is not shown. */}
        <Show when={props.post.body && props.post.body !== (props.post.mediaTitle ?? props.post.title)}>
          <Type variant="body">{props.post.body}</Type>
        </Show>
        <SongPost post={props.post} titleHref={props.titleHref} nativeNavigation={props.nativeNavigation} isolatePlayback={props.isolatePlayback} />
        <Show when={props.communityId}>{communityId => <MegapotPoolSummary communityId={communityId()} postId={props.post.id} compact />}</Show>
      </Show>
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

/** A card on desktop, a plain section on a phone's About tab. */
const aboutCardClass = "md:rounded-[var(--radius-3xl)] md:shadow-none max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none";
const aboutHeadingClass = "leading-7 tracking-normal";

function CommunityAbout(props: { community: CommunityData }) {
  const community = () => props.community;
  return (
    <div class="flex flex-col gap-4 max-md:gap-8">
      <Card class={aboutCardClass}>
        <CardContent class="flex flex-col gap-3 p-5 max-md:p-0">
          <Type class={aboutHeadingClass} variant="h3">About</Type>
          <Type variant="body">{community().description}</Type>
          <Show when={community().handle}>
            {handle => <Type class="text-sm" variant="caption">{handle()}</Type>}
          </Show>
          <Show when={membershipLine(community().membershipMode)}>
            {line => <Type class="text-sm" variant="caption">{line()}</Type>}
          </Show>
        </CardContent>
      </Card>
      <Show when={community().rules?.length}>
        <Card class={aboutCardClass}>
          <CardContent class="flex flex-col gap-4 p-5 max-md:p-0">
            <Type class={aboutHeadingClass} variant="h3">Rules</Type>
            <ol class="flex flex-col gap-4">
              <For each={orderedCommunityRules(community().rules ?? [])}>
                {(rule, index) => <li class="flex gap-3"><span class="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold leading-4 text-foreground">{index() + 1}</span><div class="flex flex-col gap-0.5"><Type variant="body-strong">{rule.title}</Type><Type class="text-sm" variant="caption">{rule.body}</Type></div></li>}
              </For>
            </ol>
          </CardContent>
        </Card>
      </Show>
      <Show when={community().referenceLinks?.length}>
        <Card class={aboutCardClass}>
          <CardContent class="flex flex-col gap-3 p-5 max-md:p-0">
            <Type class={aboutHeadingClass} variant="h3">Links</Type>
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

/**
 * The Paper banner gradient, interpolated in oklab as drawn. It is the cover
 * when the community has no image, so it carries no scrim of its own.
 */
const bannerGradientClass = "bg-linear-120/oklab from-[oklab(27.8%_-0.024_-0.018)] via-[oklab(53.9%_-0.028_0.008)] via-45% to-[oklab(78%_0.0007_0.062)]";

function CommunityBanner(props: {
  community: CommunityData;
  /** Reported on the More triggers so a surface can read it without opening them. */
  manage: CommunityManageAuthority;
  moreActions: readonly CommunityMoreAction[];
  onBack?: () => void;
  /** Feed sort, rendered left of More when the shell has one. */
  sortControl?: JSX.Element;
  /** The viewer's profile here, rendered right of More. */
  profileControl?: JSX.Element;
}) {
  return (
    <div class={`relative h-36 overflow-hidden md:h-56 ${bannerGradientClass}`} data-community-banner>
      <Show when={props.community.bannerSrc}>
        {src => <>
          <img alt="" class="size-full object-cover" src={src()} />
          {/* A photo can be light or busy, so only a photo cover darkens
              beneath the overlay controls. */}
          <div aria-hidden="true" class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45" data-community-banner-scrim />
        </>}
      </Show>
      <div class="absolute inset-x-0 top-0 flex items-center justify-between px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:p-5">
        <IconButton aria-label="Go back" class="size-10 bg-background/75 text-foreground backdrop-blur-sm" onClick={props.onBack} variant="ghost">
          <IconArrowLeft class="size-5" />
        </IconButton>
        <div class="flex items-center gap-2" data-community-banner-actions>
          {props.sortControl}
          {/* More is there for every viewer; its rows follow the viewer:
              Share always, Unfollow for a follower, Manage for a manager. */}
          <CommunityMoreMenu actions={props.moreActions} manage={props.manage} />
          {props.profileControl}
        </div>
      </div>
    </div>
  );
}

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal("Best");
  // ownedWrite: the width effect below returns a desktop viewer from About.
  const [tab, setTab] = createSignal<CommunityTab>("feed", { ownedWrite: true });
  const community = () => props.community;
  // About is a tab on a phone and a card beside the feed on desktop, so a
  // viewer who widens the window on About returns to the feed it sits beside.
  const desktop = createMediaQuery("(min-width: 768px)");
  createEffect(() => desktop() && tab() === "about", aboutOnDesktop => { if (aboutOnDesktop) setTab("feed"); });
  // Reading this is what suspends; a host that passes no feed has its posts
  // already in hand, so nothing waits.
  // Both header slots are this size in every state, so a label change cannot
  // resize them and a viewport change cannot make them wrap.
  const slotClass = "h-11 w-full min-w-0 md:w-32";
  const settledViewer = () => !props.authorityPending && !props.viewerUnknown;
  const confirmedMember = () => props.joined && settledViewer();
  /**
   * A follower who has not joined has one thing left to do here, so Join takes
   * the whole row and Unfollow moves into More. An account that cannot join
   * keeps its follow control, which is then its only action.
   */
  const followerOnly = () => props.following && !props.joined && settledViewer() && props.canJoin !== false;
  const membershipSlotClass = () => followerOnly() ? "col-span-2 h-11 w-full min-w-0" : slotClass;
  /**
   * More's rows for this viewer. Unfollow is offered only to a settled
   * follower who is not a member: a member may not unfollow (spec 016 §4.6).
   * Leave has no API endpoint yet, so it is not offered.
   */
  const moreActions = (): CommunityMoreAction[] => [
    { id: "share", label: "Share", run: () => void shareCommunityLink(props.shareUrl ?? window.location.href, community().name) },
    ...(props.following && !props.joined && settledViewer() && !props.followBusy && props.onFollowToggle !== undefined
      ? [{ id: "unfollow" as const, label: "Unfollow", run: () => props.onFollowToggle?.() }]
      : []),
    ...(props.onManage !== undefined ? [{ id: "manage" as const, label: "Manage", run: () => props.onManage?.() }] : []),
  ];
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
        moreActions={moreActions()}
        onBack={props.onBack}
        profileControl={props.profileControl}
        sortControl={props.composer || tab() === "about" ? undefined : sortControl()}
      />

      <section aria-label="Community overview" class="relative bg-background px-5 pb-5 pt-5 md:px-8 md:pb-6 md:pt-6">
        <div class="md:flex md:items-center md:gap-4">
          <div class="min-w-0 md:flex-1">
            {/* The avatar sits below the banner rather than overlapping it, and
                the title and counts are centered against it. */}
            <div class="flex min-w-0 items-center gap-3 md:gap-4">
              <div class="shrink-0">
                {/* Initials are 0.85em of the disc's font size: 24px on a
                    phone and 28px on desktop, both semibold. */}
                <CommunityAvatar
                  avatarSrc={community().avatarSrc}
                  class="size-20 border-0 text-[calc(24px/0.85)] md:size-24 md:text-[calc(28px/0.85)]"
                  communityId={community().id ?? community().handle}
                  displayName={community().name}
                  size="lg"
                />
              </div>
              <div class="min-w-0 flex-1">
                <Type as="h1" class="line-clamp-2 text-2xl md:text-3xl" variant="h1">{community().name}</Type>
                <Type class="mt-1 block truncate text-sm" variant="caption">
                  {formatCount(community().members)} members<span class="hidden md:inline"> · {formatCount(community().followers)} followers</span>
                  <span class={confirmedMember() ? "" : "invisible"} data-community-membership-status aria-hidden={confirmedMember() ? undefined : "true"}> · Member</span>
                </Type>
              </div>
            </div>
            {/* The description is the About tab's on a phone and the About
                card's on desktop; the header carries none. */}
          </div>
          {/* The reserved group keeps its size while authority settles. A
              member gets one useful command spanning the two visitor slots. */}
          <div
            aria-label="Community actions"
            class={props.composer ? "hidden" : "mt-5 grid h-11 grid-cols-2 gap-3 md:mt-0 md:w-[16.75rem] md:shrink-0"}
            data-community-actions-reserved
            role="group"
          >
            <Show when={confirmedMember()} fallback={
              <>
                <Show when={!followerOnly()}>
                  <Button
                    aria-label={followLabel().description}
                    class={slotClass}
                    data-community-follow-slot
                    disabled={props.followBusy || props.authorityPending}
                    loading={props.followBusy || props.authorityPending}
                    onClick={() => props.onFollowToggle?.()}
                    variant={props.following ? "secondary" : "outline"}
                  ><span class={props.followBusy || props.authorityPending ? "sr-only" : "truncate"}>{followLabel().text}</span></Button>
                </Show>
                <Show when={props.canJoin !== false} fallback={<div class={slotClass} aria-hidden="true" />}>
                  <Show when={props.joinDisabled && !props.authorityPending && !props.viewerUnknown && !props.joinBusy} fallback={
                    <Button
                      aria-label={joinLabel().description}
                      class={`${membershipSlotClass()} ${primaryShadowClass}`}
                      data-community-membership-slot
                      disabled={props.authorityPending || props.joinBusy}
                      loading={props.authorityPending || props.joinBusy}
                      onClick={() => props.onJoin?.()}
                    ><span class={props.authorityPending || props.joinBusy ? "sr-only" : "truncate"}>{joinLabel().text}</span></Button>
                  }>
                    <div class={`${membershipSlotClass()} flex items-center justify-center`} data-community-membership-slot role="status">
                      <Type variant="caption" class="truncate">{props.joinLabel ?? "Unavailable"}</Type>
                    </div>
                  </Show>
                </Show>
              </>
            }>
              <Button
                class={`col-span-2 h-11 w-full min-w-0 ${primaryShadowClass}`}
                data-community-post-slot
                disabled={props.createPostBusy || props.composer !== undefined}
                loading={props.createPostBusy}
                onClick={() => { setTab("feed"); props.onCreatePost?.(); }}
              >{props.createPostBusy ? "Opening…" : props.createPostLabel ?? "Post"}</Button>
            </Show>
          </div>
        </div>
      </section>
      </div>

      <Show when={!props.composer}>
        <Show when={props.activitySummary}>{summary => <div class="px-5 py-4 md:px-8">{summary()()}</div>}</Show>
        <div data-community-tabs>
        {/* A phone shares the width among three tabs. Desktop keeps Feed and
            Songs at their own width on the left; About is the card beside
            the feed there. */}
        <FlatTabBar class="px-5 md:px-8 [&>div]:gap-0 max-md:[&>div]:flex-1 md:[&>div]:gap-2">
        <FlatTabButton active={tab() === "feed"} class="max-md:flex-1 md:px-4" onClick={() => setTab("feed")}>Feed</FlatTabButton>
        <FlatTabButton active={tab() === "songs"} class="max-md:flex-1 md:px-4" onClick={() => setTab("songs")}>Songs</FlatTabButton>
        <FlatTabButton active={tab() === "about"} class="max-md:flex-1 md:hidden" onClick={() => setTab("about")}>About</FlatTabButton>
        </FlatTabBar>
        </div>
      </Show>

      <div class={props.composer ? "grid gap-8 px-4 pb-6 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8" : tab() === "about" ? "grid gap-8 px-5 pb-8 pt-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8" : "grid gap-8 p-5 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8"}>
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
                  <div class={(props.feedLeadCount ?? 0) > 0 ? `${communityFeedListClass} pt-5` : communityFeedListClass}>
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
                <div class={communityFeedListClass}><For each={songs()}>{post => renderPost(post)}</For></div>
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
