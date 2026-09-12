import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import {
  createPublicHandleSalesClient,
  type PublicHandleSalesApiClient,
} from "../../../api/handle-sales-client.ts";
import type { SessionResolution } from "../../../api/session.ts";
import {
  Button,
  toast,
  Toaster,
} from "../../../design-system.ts";
import { resolveRequestUiLocale } from "../../../lib/ui-locale-core.ts";
import { viewerSessionHint } from "../../../lib/viewer-session-hint.ts";
import { getLocaleMessages, interpolateMessage } from "../../../locales/index.ts";
import {
  loadCommunityPage,
  type CommunityPageSuccess,
  type CommunityPageViewState,
  type CommunityRouteClient,
} from "./community-page.model.ts";
import {
  communityCanonicalOrigin,
  communityRequestOrigin,
} from "./community-page-origin.ts";
import { CommunityPageShell } from "../../community/page-shell/page-shell.tsx";
import type { CommunityData, CommunityFeed } from "../../community/page-shell/page-shell-model.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import {
  PostEngagement,
  type PostEngagementPost,
} from "../../posts/post-engagement/post-engagement.tsx";
import type { PostEngagementTransport } from "../../posts/post-engagement/post-engagement-api.ts";
import type { MediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import { OperationPersonaControl } from "../../identity/operation-persona-control/operation-persona-control.tsx";
import { CommunityPersonaChoiceDialog } from "../../identity/community-persona-choice-sheet.tsx";
import { communityJoinCandidates, communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../../identity/community-persona-choice.ts";
import { createCommunityModerationSettingsApi } from "../../community/owner-settings/community-moderation-settings-api.ts";
import {
  loadCommunityThreadPage,
  type CommunityThreadPage,
} from "./community-thread-feed-api.ts";
import {
  createCommunityEngagementApi,
  type CommunityEngagementApi,
} from "./community-engagement-api.ts";
import { createCommunityEngagementController } from "./community-engagement-controller.ts";
import {
  createCommunityViewerVoteClient,
  createCommunityViewerVoteReader,
  type CommunityViewerVoteClient,
  type CommunityViewerVoteReader,
  type ViewerVote,
  type ViewerVoteRead,
} from "./community-viewer-vote-api.ts";

export interface CommunityPageProps {
  readonly pathSegment: string;
  readonly client?: CommunityRouteClient;
  readonly engagementApi?: CommunityEngagementApi;
  readonly handleSalesClient?: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly data?: CommunityPageViewState | PromiseLike<CommunityPageViewState>;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
  readonly viewerVoteClient?: CommunityViewerVoteClient;
}

function communityCopy() {
  const event = getRequestEvent();
  if (event !== undefined) {
    return getLocaleMessages(
      resolveRequestUiLocale(new URL(event.request.url), event.request.headers.get("accept-language")),
      "routes",
    ).community;
  }
  if (globalThis.location === undefined) return getLocaleMessages("en", "routes").community;
  return getLocaleMessages(
    resolveRequestUiLocale(
      new URL(location.href),
      globalThis.navigator?.language,
    ),
    "routes",
  ).community;
}

function absolutePath(path: string): string {
  const origin = communityCanonicalOrigin();
  return origin === undefined ? path : new URL(path, origin).toString();
}

function LoadingState() {
  const copy = communityCopy();
  return (
    <main aria-busy="true" aria-live="polite" data-community-state="loading">
      <h1>{copy.loading}</h1>
      <p role="status">{copy.loading}</p>
    </main>
  );
}

function MessageState(props: { readonly state: CommunityPageViewState }) {
  const copy = communityCopy();
  const message = () => props.state.kind === "invalid"
    ? copy.invalid
    : props.state.kind === "not-found" ? copy.notFound : copy.error;
  return (
    <main data-community-state={props.state.kind}>
      <Title>{message()}</Title>
      <h1>{message()}</h1>
      <p role="alert">{message()}</p>
    </main>
  );
}

function SuccessState(props: {
  /** The keyed community identity this instance is scoped to. */
  readonly communityId: string;
  readonly engagementApi: CommunityEngagementApi;
  readonly state: CommunityPageSuccess;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
  readonly viewerVoteClient?: CommunityViewerVoteClient;
}) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  // Safe to snapshot: the keyed parent rebuilds this component whenever the
  // community identity changes, so the snapshot cannot outlive its community.
  const communityId = props.communityId;
  const engagementApi = untrack(() => props.engagementApi);
  const resolveSession = untrack(() => props.resolveSession);
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [postingBusy, setPostingBusy] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [manageResolved, setManageResolved] = createSignal(false);
  const [selectedPersonaId, setSelectedPersonaId] = createSignal<string>();
  // The viewer's own vote is not in the public thread response and must not be
  // added to it: that response is deliberately anonymous and no-store. It is read
  // per post from the authenticated post read, on demand, and a post's control
  // waits for its read rather than opening with a null that would show an
  // existing vote as unselected and then toggle from the wrong prior state.
  const [viewerVotes, setViewerVotes] = createSignal<ReadonlyMap<string, ViewerVoteRead>>(new Map());
  let viewerVoteReader: CommunityViewerVoteReader | undefined;
  let viewerVoteOwner: string | undefined;
  let viewerVoteGeneration = 0;
  // Built on first use and only in a browser. This is a private per-account
  // read: a server render has no viewer to read for, and constructing a
  // credentialed client there would need a request origin it does not have.
  const ensureViewerVoteReader = (): CommunityViewerVoteReader | undefined => {
    const owner = engagement.postingSession()?.userId;
    if (owner === undefined) return undefined;
    if (viewerVoteOwner !== owner) {
      viewerVoteReader?.dispose();
      viewerVoteReader = undefined;
      viewerVoteOwner = owner;
      viewerVoteGeneration += 1;
    }
    if (viewerVoteReader !== undefined) return viewerVoteReader;
    const client = untrack(() => props.viewerVoteClient)
      ?? (globalThis.window === undefined
        ? undefined
        : createCommunityViewerVoteClient({ origin: communityRequestOrigin() }));
    if (client === undefined) return undefined;
    const generation = viewerVoteGeneration;
    viewerVoteReader = createCommunityViewerVoteReader({
      client,
      onSettled: (postId, vote) => {
        if (!active || viewerVoteGeneration !== generation) return;
        setViewerVotes(current => new Map([...current].filter(([key]) => key.startsWith(`${generation}:`))).set(`${generation}:${postId}`, vote));
      },
    });
    return viewerVoteReader;
  };
  /** The vote, or undefined while its read is still outstanding. */
  const viewerVoteFor = (postId: string): ViewerVoteRead | undefined => {
    const reader = ensureViewerVoteReader();
    const settled = viewerVotes().get(`${viewerVoteGeneration}:${postId}`);
    if (settled !== undefined) return settled;
    return reader?.read(postId);
  };
  const retryViewerVote = (postId: string) => {
    setViewerVotes(current => {
      const next = new Map(current);
      next.delete(`${viewerVoteGeneration}:${postId}`);
      return next;
    });
    viewerVoteReader?.retry(postId);
  };
  let active = true;
  onCleanup(() => {
    active = false;
    viewerVoteReader?.dispose();
  });
  const navigate = (href: string) => {
    if (props.navigate) props.navigate(href);
    else globalThis.location?.assign(href);
  };
  const engagement = createCommunityEngagementController({
    api: engagementApi,
    communityId: communityId,
    initialFollowerCount: state.community.followerCount ?? 0,
    membershipMode: state.community.membershipMode,
    navigate,
    resolveSession,
    returnTo: state.canonicalPath,
  });
  // deferStream holds the response open until the feed settles, so the HTML
  // carries the posts, a true empty feed, or an honest failure — never an
  // empty feed that is really an unstarted read. A failed read resolves to a
  // value rather than rejecting, so the boundary reports it instead of the
  // page falling over.
  const feed = createMemo<CommunityFeed>(
    () => {
      const injected = props.surfaceData?.posts;
      if (injected !== undefined) return { kind: "ready", posts: injected };
      const load = props.loadThreads ?? ((id: string) => loadCommunityThreadPage({ communityRef: id }));
      return load(communityId).then(
        (page): CommunityFeed => ({ kind: "ready", posts: page.posts }),
        (): CommunityFeed => ({ kind: "error" }),
      );
    },
    { deferStream: true },
  );

  const community = createMemo<CommunityData>(() => {
    const source = props.surfaceData ?? {};
    return {
      id: communityId,
      name: source.name ?? state.community.displayName,
      // An id-routed community has no handle to show. Printing the identifier
      // as one puts a raw uuid in the page while the canonical link, which is
      // where the identifier belongs, already carries it.
      handle: source.handle ?? (state.routeFamily === "community_id" ? "" : `c/${state.routeDisplay}`),
      description: source.description ?? state.community.description ?? interpolateMessage(copy.defaultDescription, { name: state.community.displayName }),
      members: source.members ?? state.community.memberCount ?? 0,
      followers: source.followers ?? engagement.followerCount(),
      // The shell reads the feed through its own boundary; this stays empty so
      // the header and the chrome around it never wait on a thread read.
      posts: [],
      avatarSrc: source.avatarSrc ?? state.community.avatarSrc,
      bannerSrc: source.bannerSrc ?? state.community.bannerSrc,
      membershipMode: state.community.membershipMode,
      rules: source.rules ?? state.community.rules.map((rule, position) => ({ ...rule, position: position + 1 })),
      referenceLinks: source.referenceLinks,
    };
  });
  const canonicalUrl = () => state.canonicalUrl === state.canonicalPath
    ? absolutePath(state.canonicalPath)
    : state.canonicalUrl;
  const title = () => interpolateMessage(copy.title, { name: community().name });
  const description = () => community().description;
  const settingsHref = () => `${state.canonicalPath}/settings/moderation_queue`;

  // Management authority belongs to an account, not to the page, so each
  // identity gets its own request and only the newest one may answer. Without
  // the generation a slow reply for the previous account could restore Manage
  // after the current account's reply had already denied it.
  let capabilityRequest = 0;
  createEffect(
    () => engagement.accountIdentity(),
    (accountIdentity) => {
      const request = ++capabilityRequest;
      const owns = () => active && request === capabilityRequest;
      const resolveAccess = props.resolveOwnerSettingsAccess ?? (async (id: string) => {
        const capabilities = await createCommunityModerationSettingsApi().getCapabilities({ communityId: id });
        return capabilities.includes("moderation.view");
      });
      // Deferred so the reset is not an apply-phase write, and so an
      // unresolved identity costs no request at all.
      queueMicrotask(() => {
        if (!owns()) return;
        setCanManage(false);
        setManageResolved(false);
        // Only an established account can hold management authority; undefined
        // is "not resolved yet" and null is anonymous.
        if (accountIdentity === null) {
          setManageResolved(true);
          return;
        }
        if (typeof accountIdentity !== "string") return;
        void resolveAccess(communityId)
          .then((allowed) => { if (owns()) { setCanManage(allowed); setManageResolved(true); } })
          .catch(() => { if (owns()) { setCanManage(false); setManageResolved(true); } });
      });
    },
  );

  createEffect(
    () => engagement.postingSession(),
    (session) => {
      if (session === undefined) {
        viewerVoteReader?.dispose();
        viewerVoteReader = undefined;
        viewerVoteOwner = undefined;
        setViewerVotes(new Map());
        setSelectedPersonaId(undefined);
        return;
      }
      const current = selectedPersonaId();
      const eligible = communityOperationPersonas(session.personas, communityId);
      if (current !== undefined && eligible.some(persona => persona.personaId === current)) return;
      const joinedPersona = engagement.joinedPersonaId();
      setSelectedPersonaId(eligible.some(persona => persona.personaId === joinedPersona)
        ? joinedPersona : defaultOperationPersonaId(eligible));
    },
  );


  const manageAuthorityPending = () => !manageResolved();

  /**
   * Reserve the controls row before the account identity resolves. The Worker
   * sees the session cookie, so the first HTML already knows whether to hold
   * the row; a resolved identity is always authoritative afterwards. Without
   * the hint the row would arrive late and push the server-rendered posts down
   * for every signed-in viewer.
   */
  const viewerSignedIn = () => {
    const identity = engagement.accountIdentity();
    return identity === undefined ? viewerSessionHint() : typeof identity === "string";
  };

  // Announcements this page raised. They expire on their own and can be
  // dismissed, and they are cleared when the page goes away so a stale outcome
  // never outlives the community it belonged to.
  const announced = new Set<number>();
  const announce = (raise: (message: string) => number, message: string) => {
    if (message === "") return;
    queueMicrotask(() => {
      if (!active) return;
      announced.add(raise(message));
    });
  };
  onCleanup(() => {
    for (const id of announced) toast.dismiss(id);
    announced.clear();
  });

  createEffect(() => engagement.message(), (message) => announce(toast.success, message));
  createEffect(() => engagement.error(), (message) => announce(toast.error, message));

  const openPostComposer = async (): Promise<void> => {
    if (postingBusy()) return;
    setPostingBusy(true);
    try {
      const resolved = await engagement.resolvePostingSession();
      if (active && resolved !== undefined) setComposerOpen(true);
    } finally {
      if (active) setPostingBusy(false);
    }
  };

  const personaOptions = () => toOperationPersonas(communityOperationPersonas(
    engagement.postingSession()?.personas ?? [], communityId,
  ));

  // The feed carries both vote sides; a caller that supplied only a net score
  // gets a split that preserves that net, which is all the control displays.
  // The split is not a claim about how many people voted each way.
  const engagementPost = (
    post: CommunityData["posts"][number],
    viewerVote: ViewerVote,
  ): PostEngagementPost => ({
    id: post.id,
    upvoteCount: post.upvoteCount ?? Math.max(0, post.score),
    downvoteCount: post.downvoteCount ?? Math.max(0, -post.score),
    commentCount: post.commentCount ?? 0,
    viewerVote,
  });

  return (
    <div data-community-state="success" data-community-route-family={state.routeFamily}>
      <Title>{title()}</Title>
      <Meta name="description" content={description()} />
      <Meta property="og:title" content={title()} />
      <Meta property="og:description" content={description()} />
      <Meta property="og:url" content={canonicalUrl()} />
      <Link rel="canonical" href={canonicalUrl()} />
      <div class="min-h-[calc(100dvh-4rem)] bg-background">
          <CommunityPageShell
            canJoin
            community={community()}
            createPostBusy={postingBusy()}
            followBusy={engagement.followBusy()}
            following={engagement.following()}
            joinBusy={engagement.joinBusy()}
            joinDisabled={engagement.joinDisabled()}
            joinLabel={engagement.joinLabel()}
            joined={engagement.joined()}
            authorityPending={engagement.authorityPending()}
            managePending={manageAuthorityPending()}
            viewerUnknown={engagement.viewerUnknown()}
            viewerSignedIn={viewerSignedIn()}
            feed={feed}
            personaControl={personaOptions().length > 0 ? (
              <OperationPersonaControl
                label="Commenting as"
                onSelect={setSelectedPersonaId}
                personas={personaOptions()}
                selectedPersonaId={selectedPersonaId()}
              />
            ) : engagement.personaRetryAvailable() ? (
              <Button
                class="h-9"
                disabled={engagement.personaRetryBusy()}
                onClick={() => void engagement.retryPersonas()}
                size="sm"
                type="button"
              >{engagement.personaRetryBusy() ? "Checking profiles" : "Retry profiles"}</Button>
            ) : undefined}
            renderPost={(post, render) => (
              // Both gates are reactive on purpose. This callback body runs
              // once per post, so a plain branch on a signal would freeze
              // whatever was true at that moment and never mount the controls
              // when the session or the vote arrived afterwards.
              //
              // A signed-in viewer gets working controls whether or not a
              // profile is selected: votes are account-scoped and carry no
              // persona, so gating them on one withheld an action the account
              // was always entitled to take. The comment composer inside asks
              // for a profile, because authorship is the part that needs one.
              <Show when={engagement.postingSession()} fallback={render()}>
                {session => (
                  // Until this post's vote is read, the counts stand in rather
                  // than a control claiming the viewer has not voted before
                  // anything has looked.
                  <Show when={viewerVoteFor(post.id) !== undefined && viewerVoteFor(post.id) !== "unavailable"} fallback={
                    <>
                      {render()}
                      <Show when={viewerVoteFor(post.id) === "unavailable"}>
                        <div role="status">
                          Your vote could not be checked.
                          <Button onClick={() => retryViewerVote(post.id)} size="sm" type="button">Retry vote</Button>
                        </div>
                      </Show>
                    </>
                  }>
                    <PostEngagement
                      communityId={communityId}
                      personaId={selectedPersonaId()}
                      post={engagementPost(post, (() => {
                        const vote = viewerVoteFor(post.id);
                        return vote === 1 || vote === -1 ? vote : null;
                      })())}
                      principalId={session().userId}
                      transport={props.postEngagementTransport}
                    >{controls => render(controls)}</PostEngagement>
                  </Show>
                )}
              </Show>
            )}
            onCreatePost={engagement.joined() ? () => void openPostComposer() : undefined}
            onFollowToggle={() => void engagement.followToggle()}
            onJoin={() => void engagement.joinCommunity()}
            onManage={canManage() ? () => navigate(settingsHref()) : undefined}
          />
          {/* Action outcomes go to the shared toast region, which owns its own
              lifetime, dismissal and announcement priority. A hand-rolled
              overlay had none of those: it covered the page until something
              else replaced it, and it nested an alert inside a polite region.
              The retry control is not an outcome, so it stays on the page, in
              the reserved persona row where the missing control would be. */}
          <Toaster />
          <CommunityPersonaChoiceDialog
            choice={engagement.joinPersonaChoice()}
            createNewUnavailable
            createNewLabel="Create a new persona in this Community"
            label="Joining as"
            note="Membership attaches to your account. The persona you choose becomes your public identity in this Community; your private Study progress and streaks stay with your account either way."
            onChoose={engagement.confirmJoinPersona}
            onOpenChange={(open) => { if (!open) engagement.cancelJoinPersona(); }}
            open={engagement.joinPersonaStep()}
            personas={communityJoinCandidates(engagement.postingSession()?.personas ?? [], communityId)}
          />
      </div>
      {/* The membership mode is stated visibly once, in the About card the
          shell renders from membershipMode. The names storefront link lived
          here invisibly for keyboard users only; it returns when it has a
          visible place on the page. */}
      <p class="sr-only" data-community-route={state.requestedPathSegment}>{state.routeDisplay}</p>
      <Show when={engagement.postingSession()}>
        {session => (
          <CreatePostDialog
            communityContext={{ id: communityId, name: community().name }}
            onOpenChange={setComposerOpen}
            open={composerOpen()}
            personaId={selectedPersonaId()}
            personas={communityOperationPersonas(session().personas, communityId)}
            principalId={session().userId}
            mediaStorage={props.postComposerMediaStorage}
          />
        )}
      </Show>
    </div>
  );
}

function CommunityState(props: {
  readonly engagementApi: CommunityEngagementApi;
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly postComposerMediaStorage?: MediaSubmissionStorage;
  readonly viewerVoteClient?: CommunityViewerVoteClient;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  // The inner Show is keyed by community identity: a same-route move to another
  // community rebuilds the controller, the loaders and the local state instead
  // of leaving them bound to the community that was here before.
  return (
    <Show when={success()} fallback={<MessageState state={props.state} />}>
      {state => (
        <Show when={state().communityId} keyed>
          {communityId => (
            <SuccessState
              communityId={communityId}
              engagementApi={props.engagementApi}
              state={state()}
              handleSalesClient={props.handleSalesClient}
              resolveSession={props.resolveSession}
              resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
              navigate={props.navigate}
              surfaceData={props.surfaceData}
              loadThreads={props.loadThreads}
              postEngagementTransport={props.postEngagementTransport}
              postComposerMediaStorage={props.postComposerMediaStorage}
              viewerVoteClient={props.viewerVoteClient}
            />
          )}
        </Show>
      )}
    </Show>
  );
}

function CommunityData(props: CommunityPageProps) {
  const client = untrack(() => props.client)
    ?? createPublicCommunityRouteClient({ origin: communityRequestOrigin() });
  const handleSalesClient = untrack(() => props.handleSalesClient)
    ?? createPublicHandleSalesClient({ origin: communityRequestOrigin() });
  const engagementApi = untrack(() => props.engagementApi)
    ?? createCommunityEngagementApi({ origin: communityRequestOrigin() });
  const state = createMemo(
    () => props.data ?? loadCommunityPage(client, props.pathSegment, communityCanonicalOrigin()),
    { deferStream: true },
  );
  return (
    <CommunityState
      engagementApi={engagementApi}
      viewerVoteClient={props.viewerVoteClient}
      state={state()}
      handleSalesClient={handleSalesClient}
      resolveSession={props.resolveSession}
      resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
      navigate={props.navigate}
      surfaceData={props.surfaceData}
      loadThreads={props.loadThreads}
      postEngagementTransport={props.postEngagementTransport}
      postComposerMediaStorage={props.postComposerMediaStorage}
    />
  );
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
