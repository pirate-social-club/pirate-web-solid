import { ApiClientError } from "@pirate/api-client";
import { PageContainer } from "@pirate/web-solid-ui";
import { Title } from "@solidjs/meta";
import { Show, createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

import {
  loadAccountCommunityMemberships,
  type AccountCommunityMembership,
} from "../../../api/account-community-memberships.ts";
import {
  resolveSession as resolveApplicationSession,
  sessionPersonasUnavailable,
  type AccountSessionResolution,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../../api/session.ts";
import { Button, Type } from "../../../design-system.ts";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { communityOperationPersonas } from "../../identity/community-persona-choice.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import { readSongTitle as readPublicSongTitle, type SongSourceReader } from "../../posts/post-composer/song-excerpt-source.ts";
import {
  useApplicationSession,
  type ApplicationSessionState,
} from "../../shell/application-session.tsx";
import type { FreshVideoEntry } from "../../posts/video-outcomes/fresh-composer-entry.ts";
import { YourCommunitiesPageView, type YourCommunitySummary } from "./your-communities-page.tsx";


type MembershipRouteState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "ready"; memberships: readonly AccountCommunityMembership[] }>
  | Readonly<{ kind: "error"; message: string }>;

export interface YourCommunitiesRouteProps {
  readonly freshVideo?: FreshVideoEntry;
  readonly initialVideoSong?: { readonly postId: string };
  readonly applicationSession?: Accessor<ApplicationSessionState | undefined>;
  readonly loadMemberships?: () => Promise<readonly AccountCommunityMembership[]>;
  /** The pending song's title, when the step names it. */
  readonly readSongTitle?: (postId: string) => Promise<string | null>;
  readonly videoSongReader?: SongSourceReader;
  readonly resolvePostingSession?: () => Promise<SessionResolution>;
  readonly navigate?: (href: string) => void;
}

/** `linkless` drops the community's own address, so its row is only a name: a
 * link that leaves the step would also leave the song it is choosing for. */
function summary(membership: AccountCommunityMembership, linkless = false): YourCommunitySummary {
  return {
    communityId: membership.community_id,
    displayName: membership.display_name,
    resourceHref: linkless ? null : membership.resource_href ?? membership.canonical_route?.href ?? null,
    routeSlug: membership.canonical_route?.path_segment ?? null,
  };
}

export function YourCommunitiesRouteView(props: YourCommunitiesRouteProps = {}) {
  const inheritedSession = useApplicationSession();
  const session = props.applicationSession ?? inheritedSession;
  const loadMemberships = props.loadMemberships ?? (() => loadAccountCommunityMemberships());
  const readSongTitle = props.readSongTitle ?? readPublicSongTitle;
  const resolvePostingSession = props.resolvePostingSession ?? resolveApplicationSession;
  const [state, setState] = createSignal<MembershipRouteState>({ kind: "loading" });
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [selectedMembership, setSelectedMembership] = createSignal<AccountCommunityMembership>();
  const [postingSession, setPostingSession] = createSignal<AuthenticatedSession>();
  const [postingCommunityId, setPostingCommunityId] = createSignal<string>();
  const [actionError, setActionError] = createSignal("");
  const [songTitle, setSongTitle] = createSignal<string | null>(null);
  let active = true;
  let loadRequest = 0;
  let titleRequest = 0;
  onCleanup(() => {
    active = false;
    loadRequest += 1;
  });

  const load = (account: AccountSessionResolution) => {
    const request = ++loadRequest;
    if (account === "anonymous") {
      setComposerOpen(false);
      setPostingSession(undefined);
      setSelectedMembership(undefined);
      setState({ kind: "anonymous" });
      return;
    }
    setState({ kind: "loading" });
    void loadMemberships()
      .then((memberships) => {
        if (active && request === loadRequest) setState({ kind: "ready", memberships });
      })
      .catch((error) => {
        if (!active || request !== loadRequest) return;
        if (error instanceof ApiClientError && error.status === 401) {
          setState({ kind: "anonymous" });
        } else {
          setState({ kind: "error", message: "We couldn't load your Communities." });
        }
      });
  };

  /** The error state's own retry control: the session effect that first
   * drove the load will not run again on its own. */
  const retryLoad = () => {
    const current = session();
    if (current === undefined || current === "resolving") return;
    if (current === "anonymous" || current === "failed") return;
    load(current);
  };

  createEffect(
    () => session(),
    (current) => {
      const epoch = ++loadRequest;
      queueMicrotask(() => {
        if (!active || epoch !== loadRequest) return;
        setComposerOpen(false);
        setPostingSession(undefined);
        setSelectedMembership(undefined);
        setPostingCommunityId(undefined);
        setActionError("");
        if (current === undefined || current === "resolving") {
          setState({ kind: "loading" });
          return;
        }
        if (current === "failed") {
          setState({ kind: "error", message: "We couldn't check your account. Use Retry account check to reconnect." });
          return;
        }
        load(current);
      });
    },
  );

  const memberships = createMemo(() => {
    const current = state();
    return current.kind === "ready" ? current.memberships : [];
  });
  const videoPending = () => props.initialVideoSong !== undefined || props.freshVideo !== undefined;
  const joinedCommunities = createMemo(() => memberships()
    .filter(item => !videoPending() || (item.membership_status === "member" && item.can_post === true))
    .map(item => summary(item, videoPending())));
  // The step is about one song, so its heading says which. The title is a
  // courtesy read: without it the heading still makes sense.
  createEffect(
    () => props.freshVideo?.song?.postId ?? props.initialVideoSong?.postId,
    (postId) => {
      const request = ++titleRequest;
      queueMicrotask(() => {
        if (active && request === titleRequest) setSongTitle(null);
      });
      if (postId === undefined) return;
      void readSongTitle(postId).then(
        (title) => { if (active && request === titleRequest) setSongTitle(title); },
        () => {},
      );
    },
  );
  // Creating a community leaves the step and drops the song, so it is offered
  // only where it is the way forward: with no community to post in. There the
  // page says what will happen before it offers the action.
  const noDestination = () => videoPending() && joinedCommunities().length === 0;
  const offerCreate = () => !videoPending() || noDestination();
  const heading = () => {
    if (!videoPending()) return "Your communities";
    if (props.freshVideo?.song === null) return "Post a video";
    const title = songTitle();
    return title === null ? "Post a video with this song" : `Post a video with “${title}”`;
  };
  const errorMessage = createMemo(() => {
    const current = state();
    return current.kind === "error" ? current.message : "";
  });
  const navigate = (href: string) => {
    if (props.navigate !== undefined) props.navigate(href);
    else globalThis.location?.assign(href);
  };

  const openPostComposer = async (community: YourCommunitySummary): Promise<void> => {
    if (postingCommunityId() !== undefined) return;
    const account = session();
    if (account === undefined || account === "resolving" || account === "anonymous" || account === "failed") return;
    const epoch = loadRequest;
    const isCurrent = () => {
      const current = session();
      return active && epoch === loadRequest && current !== undefined &&
        current !== "resolving" && current !== "anonymous" && current !== "failed" && current.userId === account.userId;
    };
    setPostingCommunityId(community.communityId);
    setActionError("");
    try {
      const liveMemberships = await loadMemberships();
      if (!isCurrent()) return;
      const membership = liveMemberships.find(
        (item) =>
          item.community_id === community.communityId &&
          item.membership_status === "member" &&
          item.can_post === true,
      );
      if (membership === undefined) {
        if (active) setActionError("You can no longer post in this Community.");
        return;
      }
      const resolved = await resolvePostingSession();
      if (!isCurrent()) return;
      if (resolved === "anonymous") {
        requestGlobalSignIn();
        return;
      }
      if (resolved.userId !== account.userId) return;
      if (sessionPersonasUnavailable(resolved)) {
        setActionError("We couldn't load your community profiles. Choose Post again to retry.");
        return;
      }
      setSelectedMembership(membership);
      setPostingSession(resolved);
      setComposerOpen(true);
    } catch {
      if (isCurrent()) setActionError("We couldn't verify posting access. Nothing changed.");
    } finally {
      if (isCurrent()) setPostingCommunityId(undefined);
    }
  };

  const selectedSummary = createMemo(() => {
    const membership = selectedMembership();
    return membership === undefined ? undefined : summary(membership);
  });
  const postingPersonas = createMemo(() => {
    const session = postingSession();
    const community = selectedSummary();
    return session === undefined || community === undefined
      ? []
      : communityOperationPersonas(session.personas, community.communityId);
  });

  return (
    <main data-route-path="/communities" data-communities-state={state().kind}>
      <Title>{videoPending() ? "Post a video" : "Your communities"} | Pirate</Title>
      <Show when={state().kind === "loading"}>
        <PageContainer>
          <Type as="p" role="status">
            Loading your Communities…
          </Type>
        </PageContainer>
      </Show>
      <Show when={state().kind === "anonymous"}>
        <PageContainer class="flex flex-col gap-4">
          <Type as="h1" variant="h1">
            Your communities
          </Type>
          <Type as="p">{!videoPending()
            ? "Sign in to see your communities."
            : "Sign in to choose where to post your video."}</Type>
          <Button class="w-fit" onClick={requestGlobalSignIn}>
            Sign in
          </Button>
        </PageContainer>
      </Show>
      <Show when={state().kind === "error"}>
        <PageContainer class="flex flex-col gap-4">
          <Type as="h1" variant="h1">
            Your communities
          </Type>
          <Type as="p" role="alert">
            {errorMessage()}
          </Type>
          <Show when={session() !== undefined && session() !== "resolving" && session() !== "anonymous" && session() !== "failed"}>
            <Button class="w-fit" onClick={retryLoad} type="button" variant="secondary">
              Try again
            </Button>
          </Show>
        </PageContainer>
      </Show>
      <Show when={state().kind === "ready"}>
        <YourCommunitiesPageView
          createCommunityLabel={offerCreate() ? "Create community" : undefined}
          createCommunityBelow={noDestination()}
          description={!videoPending() ? undefined : noDestination()
            ? props.freshVideo?.song === null
              ? "You don't have a community where you can post this video yet. Create one, then come back to post your video."
              : "You don't have a community where you can post this video yet. Create one, then come back to the song and choose Use this song again."
            : "Choose a community to post it in."}
          emptyJoinedLabel={videoPending() ? "" : "You aren't a member of a community yet."}
          joinedCommunities={joinedCommunities()}
          joinedLabel="Communities"
          onCreateCommunity={offerCreate() ? () => navigate("/communities/new") : undefined}
          onPostHere={(community) => void openPostComposer(community)}
          onSelectCommunity={(community) => {
            if (community.resourceHref !== null && community.resourceHref !== undefined)
              navigate(community.resourceHref);
          }}
          postActionLabel={videoPending() ? (community) => `Post video in ${community.displayName}` : undefined}
          postActionText={videoPending() ? "Post video" : undefined}
          postingCommunityId={postingCommunityId()}
          title={heading()}
        />
      </Show>
      <Show when={postingCommunityId()}>
        <p class="sr-only" role="status">
          Checking posting access…
        </p>
      </Show>
      <Show when={actionError()}>
        {(message) => (
          <p class="mx-5 text-sm text-destructive-text" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <Show when={postingSession()}>
        {(resolved) => (
          <Show when={selectedSummary()}>
            {(community) => (
              <CreatePostDialog
                communityContext={{ id: community().communityId, name: community().displayName }}
                initialVideoSong={props.initialVideoSong}
                freshVideo={props.freshVideo}
                videoSongReader={props.videoSongReader}
                onPublished={href => { if (href !== undefined) navigate(href); }}
                // The post is shown in its community's feed while it is
                // delivered, so the author is taken there to see it.
                onTextSubmitted={() => navigate(community().resourceHref ?? `/c/${community().communityId}`)}
                onOpenChange={setComposerOpen}
                open={composerOpen()}
                personaId={postingPersonas()[0]?.personaId}
                personas={postingPersonas()}
                principalId={resolved().userId}
              />
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
