import type { MediaSubmissionTransport } from "../../posts/media-submission/transport";
import { requestGlobalSignIn, requestGlobalSignInCompletion } from "../../auth/global-sign-in-host.tsx";
import { EngagementControls } from "../../posts/shared-engagement/engagement-controls.tsx";
import { onSessionRefreshed } from "../../../api/session.ts";
import { createSessionApiClient } from "../../../api/client.ts";
import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Loading, Show, createEffect, createMemo, createSignal, onCleanup, sharedConfig, untrack } from "solid-js";
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
import { reportCommunityFeedFailure } from "./community-feed-diagnostic.ts";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import { isPublicSongMp3 } from "../../posts/post-composer/write-step.tsx";
import type { TextSubmissionTransport } from "../../posts/post-composer/text-submission-transport.ts";
import { PendingSongs } from "../../posts/song-submission/pending-songs.tsx";
import {
  createSongSubmissionStore,
  useSongSubmissionStore,
  type SongSubmissionItem,
} from "../../posts/song-submission/song-submission-store.tsx";
import { PendingTextPosts } from "../../posts/text-submission/pending-text-posts.tsx";
import { TextPostPanel, emptyTextPostDraft, type TextPostDraft } from "../../posts/text-submission/text-post-panel.tsx";
import {
  createTextSubmissionStore,
  useTextSubmissionStore,
  type TextSubmissionItem,
} from "../../posts/text-submission/text-submission-store.tsx";
import {
  PostEngagement,
  type PostEngagementPost,
} from "../../posts/post-engagement/post-engagement.tsx";
import type { PostEngagementTransport } from "../../posts/post-engagement/post-engagement-api.ts";
import { useActivePersonaStoreOptional } from "../../identity/active-persona-store.tsx";
import { CommunityPersonaControl } from "../../identity/community-persona-control.tsx";
import { PersonaSwitcherSheet } from "../../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import { CommunityPersonaChoiceDialog } from "../../identity/community-persona-choice-sheet.tsx";
import { communityJoinCandidates, communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../../identity/community-persona-choice.ts";
import { createCommunityModerationSettingsApi } from "../../community/owner-settings/community-moderation-settings-api.ts";
import {
  createCommunityThreadFeedClient,
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
  /** Entering from a song post's "Use this song": the song is carried into the
   * video composer, which opens once a posting session is resolved. */
  readonly initialVideoSong?: { readonly postId: string };
  /** Clears the compose marker from the URL once the song-entry composer has
   * been opened and dismissed, so a reload browses instead of reopening it. */
  readonly clearVideoSongIntent?: () => void;
  /** Entering from a "Post here" action elsewhere: open the text composer
   * once the viewer's posting session is resolved. */
  readonly composeText?: boolean;
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
  readonly viewerVoteClient?: CommunityViewerVoteClient;
  /** Stands in for the text post endpoint when the page renders without the
   * application shell, as in stories and tests. */
  readonly textSubmissionTransport?: TextSubmissionTransport;
  readonly mediaSubmissionTransport?: MediaSubmissionTransport;
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
  readonly initialVideoSong?: { readonly postId: string };
  /** Clears the song-entry compose marker once its composer is dismissed. */
  readonly clearVideoSongIntent?: () => void;
  readonly composeText?: boolean;
  readonly state: CommunityPageSuccess;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly viewerVoteClient?: CommunityViewerVoteClient;
  readonly textSubmissionTransport?: TextSubmissionTransport;
  readonly mediaSubmissionTransport?: MediaSubmissionTransport;
}) {
  const copy = communityCopy();
  const state = untrack(() => props.state);
  // Safe to snapshot: the keyed parent rebuilds this component whenever the
  // community identity changes, so the snapshot cannot outlive its community.
  const communityId = props.communityId;
  const engagementApi = untrack(() => props.engagementApi);
  const resolveSession = untrack(() => props.resolveSession);
  // The media composer: the song steps and the video capture flow. Text has
  // its own form; song steps use the same main-column surface.
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [mediaEntry, setMediaEntry] = createSignal<{ readonly kind: "video" } | { readonly kind: "song"; readonly file: File }>();
  const [textOpen, setTextOpen] = createSignal(false);
  const [textDraft, setTextDraft] = createSignal<TextPostDraft>(emptyTextPostDraft);
  // Posts the feed already carries that this author just published, kept
  // first so a confirmed post does not jump away from where it appeared.
  const [pinnedPostIds, setPinnedPostIds] = createSignal<readonly string[]>([], { ownedWrite: true });
  // The application shell owns text posts in flight. An isolated render has no
  // shell, so it owns a store for as long as it is mounted.
  const shellTextStore = useTextSubmissionStore();
  const textStore = shellTextStore ?? createTextSubmissionStore({ transport: untrack(() => props.textSubmissionTransport) });
  // Songs the server is still processing have the same kind of owner.
  const shellSongStore = useSongSubmissionStore();
  const songStore = shellSongStore ?? createSongSubmissionStore();
  const [postingBusy, setPostingBusy] = createSignal(false);
  const [canManage, setCanManage] = createSignal(false);
  const [manageResolved, setManageResolved] = createSignal(false);
  // The app-level store owns "which profile is acting in this community" when
  // the shell is mounted; isolated renders (tests, stories) keep a local
  // selection so the page still works without chrome.
  const personaStore = useActivePersonaStoreOptional();
  const [localPersonaId, setLocalPersonaId] = createSignal<string>();
  const [localSwitcherOpen, setLocalSwitcherOpen] = createSignal(false);
  const selectedPersonaId = () => personaStore === undefined
    ? localPersonaId()
    : personaStore.activePersonaId(communityId);
  const selectPersonaId = (personaId: string | undefined) => {
    if (personaStore === undefined) setLocalPersonaId(personaId);
    else personaStore.selectPersona(communityId, personaId);
  };
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
  const [authorizedFeed, setAuthorizedFeed] = createSignal<CommunityFeed>();
  const [recoverInitialFeed, setRecoverInitialFeed] = createSignal(false);
  createEffect(
    () => state.initialFeed?.kind === "error",
    (failed) => {
      if (!failed) return;
      // Effects do not run during SSR. Defer past the initial hydration pass,
      // preserving its error markup before starting one browser recovery read.
      const recover = () => queueMicrotask(() => { if (active) setRecoverInitialFeed(true); });
      if (sharedConfig.onHydrationEnd) sharedConfig.onHydrationEnd(recover);
      else recover();
    },
  );
  const loadAuthorizedThreads = () => props.loadThreads
    ? props.loadThreads(communityId)
    : loadCommunityThreadPage({ communityRef: communityId, client: createSessionApiClient() });
  /**
   * Every authorized feed read lands here, so a post this author just
   * published is never shown twice: once the feed carries it, the optimistic
   * entry is dropped and the real post is kept first.
   */
  const applyAuthorizedFeed = (page: CommunityThreadPage) => {
    const present = new Set(page.posts.map(post => post.id));
    const publishedSongs = untrack(pendingSongs).flatMap(item => item.view.status === "published" && present.has(item.view.postId)
      ? [{ submissionId: item.submissionId, postId: item.view.postId }]
      : []);
    if (publishedSongs.length > 0) {
      setPinnedPostIds(current => [...publishedSongs.map(item => item.postId), ...current]);
      for (const item of publishedSongs) songStore.dismiss(item.submissionId);
    }
    const confirmed = untrack(pendingTextPosts).filter(item => item.status === "published" && item.postId !== null && present.has(item.postId));
    setAuthorizedFeed({ kind: "ready", posts: page.posts, ageLockedCount: page.ageLockedCount });
    if (confirmed.length === 0) return;
    // SAFETY: the filter above kept only items whose postId is a string.
    setPinnedPostIds(current => [...confirmed.map(item => item.postId as string), ...current]);
    for (const item of confirmed) textStore.dismiss(item.id);
  };
  onCleanup(onSessionRefreshed(() => {
    setAuthorizedFeed(undefined);
    // The server-rendered feed predates anything posted from this page, so a
    // post already confirmed here is read back rather than left to vanish.
    if (untrack(pinnedPostIds).length > 0) void reconcilePublished();
  }));
  const refreshAgeFeed = async (signal: AbortSignal) => {
    const page = await loadAuthorizedThreads();
    if (!signal.aborted) applyAuthorizedFeed(page);
  };
  const feed = createMemo<CommunityFeed>(
    () => {
      const authorized = authorizedFeed();
      if (authorized) return authorized;
      const injected = props.surfaceData?.posts;
      if (injected !== undefined) return { kind: "ready", posts: injected };
      const initialFeed = state.initialFeed;
      // Adopt identical initial state on both sides, including failures, then
      // allow one post-hydration recovery. Ready and empty feeds never refetch.
      if (initialFeed !== undefined && (initialFeed.kind === "ready" || !recoverInitialFeed())) return initialFeed;
      const load = props.loadThreads ?? ((id: string) => loadCommunityThreadPage({
        communityRef: id,
        client: createCommunityThreadFeedClient({ origin: communityRequestOrigin() }),
      }));
      return load(communityId).then(
        (page): CommunityFeed => ({ kind: "ready", posts: page.posts, ageLockedCount: page.ageLockedCount }),
        (error): CommunityFeed => {
          reportCommunityFeedFailure(error, "page");
          return { kind: "error" };
        },
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

  let postingSessionRequest = 0;
  createEffect(
    () => engagement.postingSession(),
    (session) => {
      const request = ++postingSessionRequest;
      // Preflight data can mount synchronously. Do not write signals in the
      // effect's owned apply phase; stale sessions must not reset a new owner.
      queueMicrotask(() => {
        if (!active || request !== postingSessionRequest) return;
        if (session === undefined) {
          viewerVoteReader?.dispose();
          viewerVoteReader = undefined;
          viewerVoteOwner = undefined;
          setViewerVotes(new Map());
          selectPersonaId(undefined);
          return;
        }
        const current = selectedPersonaId();
        const eligible = communityOperationPersonas(session.personas, communityId);
        if (current !== undefined && eligible.some(persona => persona.personaId === current)) return;
        const joinedPersona = engagement.joinedPersonaId();
        selectPersonaId(eligible.some(persona => persona.personaId === joinedPersona)
          ? joinedPersona : defaultOperationPersonaId(eligible));
      });
    },
  );


  const manageAuthorityPending = () => !manageResolved();

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

  /** Resolves true once the text composer is open. */
  const openPostComposer = async (): Promise<boolean> => {
    if (postingBusy()) return false;
    setPostingBusy(true);
    try {
      const resolved = await engagement.resolvePostingSession();
      if (!active || resolved === undefined) return false;
      setTextOpen(true);
      return true;
    } finally {
      if (active) setPostingBusy(false);
    }
  };

  // An entry that carries a song opens the video composer through the same
  // session resolution the Post action uses, once: closing the composer is the
  // author's decision, not a reason to reopen it.
  let openedForSong = false;
  let openingForSong = false;
  createEffect(
    () => [props.initialVideoSong, engagement.joined(), engagement.accountIdentity()] as const,
    ([song, joined, identity]) => {
      if (openedForSong || openingForSong || !song || !joined || identity === undefined) return;
      openingForSong = true;
      setPostingBusy(true);
      void engagement.resolvePostingSession().then(
        (resolved) => {
          if (active && resolved !== undefined) {
            openedForSong = true;
            setComposerOpen(true);
          }
        },
        () => undefined,
      ).finally(() => {
        openingForSong = false;
        if (active) setPostingBusy(false);
      });
    },
  );

  const pendingTextPosts = createMemo<readonly TextSubmissionItem[]>(() => {
    const account = engagement.postingSession()?.userId;
    if (account === undefined) return [];
    return textStore.items().filter(item => item.communityId === communityId && item.accountId === account);
  });
  const pendingSongs = createMemo<readonly SongSubmissionItem[]>(() => {
    const account = engagement.postingSession()?.userId;
    if (account === undefined) return [];
    return songStore.items().filter(item => item.communityId === communityId && item.accountId === account);
  });
  createEffect(
    () => pendingSongs().filter(item => item.view.status === "published").map(item => item.submissionId).join(","),
    (publishedIds) => {
      if (publishedIds === "") return;
      queueMicrotask(() => { if (active) void reconcilePublished(); });
    },
  );
  onCleanup(() => {
    for (const item of untrack(pendingSongs)) if (item.view.status === "published") songStore.dismiss(item.submissionId);
    if (shellSongStore === null) songStore.dispose();
  });
  // A confirmed post is read back into the feed. Once the feed carries it the
  // optimistic entry is dropped and the real post takes its place at the top;
  // until then the entry stays, so the author never sees their post vanish.
  let reconciling = false;
  let reconcileAgain = false;
  async function reconcilePublished(): Promise<void> {
    if (reconciling) {
      // A post confirmed while a read is in flight needs a read of its own.
      reconcileAgain = true;
      return;
    }
    reconciling = true;
    try {
      const page = await loadAuthorizedThreads();
      if (active) applyAuthorizedFeed(page);
    } catch {
      // The post is published either way; its optimistic entry keeps showing it.
    } finally {
      reconciling = false;
      if (reconcileAgain && active) {
        reconcileAgain = false;
        void reconcilePublished();
      }
    }
  }
  createEffect(
    () => pendingTextPosts().filter(item => item.status === "published").map(item => item.id).join(","),
    (publishedIds) => {
      if (publishedIds === "") return;
      queueMicrotask(() => { if (active) void reconcilePublished(); });
    },
  );
  onCleanup(() => {
    // Nothing is left to deliver for a confirmed post, so it does not follow
    // the author to other pages. Posts still in flight stay with the shell.
    for (const item of untrack(pendingTextPosts)) if (item.status === "published") textStore.dismiss(item.id);
    if (shellTextStore === null) textStore.dispose();
  });
  // A held post is sent once its own account is signed in again. The shell
  // does that from a freshly resolved session. An isolated render has no
  // shell, so it resolves the session itself after the prompt and resumes only
  // for the account that resolution names.
  const signInAbort = new AbortController();
  onCleanup(() => signInAbort.abort());
  const signInToFinishPosting = () => {
    if (shellTextStore !== null) {
      requestGlobalSignIn();
      return;
    }
    void requestGlobalSignInCompletion(signInAbort.signal)
      .then(authenticated => authenticated ? engagement.resolvePostingSession() : undefined)
      .then((resolved) => { if (active && resolved !== undefined) textStore.resume(resolved.userId); })
      .catch(() => undefined);
  };
  // An entry that asks for the text composer opens it once, through the same
  // session resolution as the Post action, and then drops its URL marker so a
  // reload browses instead of reopening it.
  let textEntrySettled = false;
  let openingForText = false;
  createEffect(
    () => [props.composeText === true, engagement.joined(), engagement.accountIdentity(), engagement.authorityPending()] as const,
    ([wanted, joined, identity, pending]) => {
      if (textEntrySettled || openingForText || !wanted || identity === undefined || pending) return;
      if (!joined) {
        // Not a member: the entry is spent, so joining later does not open a
        // composer nobody asked for.
        textEntrySettled = true;
        queueMicrotask(() => { if (active) props.clearVideoSongIntent?.(); });
        return;
      }
      openingForText = true;
      queueMicrotask(() => {
        if (!active) return;
        void openPostComposer().then(
          (opened) => {
            if (!active || !opened) return;
            textEntrySettled = true;
            props.clearVideoSongIntent?.();
          },
          () => undefined,
        ).finally(() => { openingForText = false; });
      });
    },
  );
  const submitTextPost = () => {
    const session = engagement.postingSession();
    const personaId = selectedPersonaId();
    const draft = textDraft();
    if (session === undefined || personaId === undefined || draft.body.trim() === "") return;
    const persona = communityOperationPersonas(session.personas, communityId).find(candidate => candidate.personaId === personaId);
    if (persona === undefined) return;
    textStore.submit({
      accountId: session.userId,
      communityId,
      personaId,
      title: draft.title,
      body: draft.body,
      ageGatePolicy: draft.ageGatePolicy,
      authorHandle: persona.displayName ?? persona.primaryPublicHandle ?? undefined,
      authorAvatarSrc: persona.avatarRef ?? null,
    });
    setTextDraft(emptyTextPostDraft);
    setTextOpen(false);
  };
  const editTextPost = (item: TextSubmissionItem) => {
    setTextOpen(true);
    // Text already being written is not replaced; the refused post stays in
    // the feed until the composer is free to take it.
    if (textDraft().body.trim() !== "" || textDraft().title.trim() !== "") return;
    textStore.dismiss(item.id);
    setTextDraft({ title: item.title, body: item.body, ageGatePolicy: item.ageGatePolicy });
  };
  const openMediaComposer = (entry: { readonly kind: "video" } | { readonly kind: "song"; readonly file: File }) => {
    if (entry.kind === "song" && !isPublicSongMp3(entry.file)) {
      toast.error("Songs must be MP3 files.");
      return;
    }
    setTextOpen(false);
    setMediaEntry(entry);
    setComposerOpen(true);
  };

  const personaOptions = () => toOperationPersonas(communityOperationPersonas(
    engagement.postingSession()?.personas ?? [], communityId,
  ));
  // The shell's bottom-right profile control reads this target. It exists only
  // while the page owns an active persona, so no other surface can open a
  // switcher for a community the viewer is not looking at.
  createEffect(
    () => [communityId, personaStore, personaOptions(), engagement.personaRetryAvailable(), engagement.personaRetryBusy()] as const,
    ([targetCommunityId, store, personas, unavailable, loading]) => {
      if (store === undefined) return;
      store.setTarget({
        communityId: targetCommunityId,
        personas,
        title: "Profile in this community",
        unavailable,
        loading,
        onRetry: () => void engagement.retryPersonas(),
      });
    },
  );
  onCleanup(() => {
    personaStore?.setTarget(undefined);
  });

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

  const mediaComposer = (embedded: boolean) => (
      <Show when={engagement.postingSession()}>
        {session => (
          <CreatePostDialog
            presentation={embedded ? "inline" : "fullscreen"}
            communityContext={{ id: communityId, name: community().name }}
            initialVideoSong={props.initialVideoSong}
            initialMode={mediaEntry()?.kind}
            initialSongFile={(() => { const entry = mediaEntry(); return entry?.kind === "song" ? entry.file : undefined; })()}
            songStore={songStore}
            mediaTransport={props.mediaSubmissionTransport}
            onPublished={href => { if (href !== undefined) navigate(href); }}
            onOpenChange={(open) => {
              setComposerOpen(open);
              if (!open) setMediaEntry(undefined);
              // Dismissing the composer the song entry opened also clears
              // the URL marker, so a reload cannot reopen it.
              if (!open && openedForSong) {
                openedForSong = false;
                props.clearVideoSongIntent?.();
              }
            }}
            open={composerOpen()}
            personaId={selectedPersonaId()}
            personas={communityOperationPersonas(session().personas, communityId)}
            principalId={session().userId}
          />
        )}
      </Show>
  );

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
            onBack={() => navigate("/communities")}
            canJoin
            community={community()}
            createPostBusy={postingBusy()}
            createPostLabel={engagement.personaRetryAvailable() ? "Retry and open Post" : "Post"}
            followBusy={engagement.followBusy()}
            following={engagement.following()}
            joinBusy={engagement.joinBusy()}
            joinDisabled={engagement.joinDisabled()}
            joinLabel={engagement.joinLabel()}
            joined={engagement.joined()}
            authorityPending={engagement.authorityPending()}
            managePending={manageAuthorityPending()}
            viewerUnknown={engagement.viewerUnknown()}
            feed={feed}
            pinnedPostIds={pinnedPostIds()}
            feedLeadCount={pendingTextPosts().length + pendingSongs().length}
            feedLead={() => (<>
              <PendingSongs
                items={pendingSongs()}
                onCheck={songStore.check}
                onDismiss={songStore.dismiss}
                onRetry={songStore.retry}
                onBindOriginal={songStore.bindOriginal}
                onRetryOriginal={songStore.retryOriginal}
              />
              <PendingTextPosts
                items={pendingTextPosts()}
                onDismiss={textStore.dismiss}
                onEdit={editTextPost}
                onRetry={textStore.retry}
                onSignIn={signInToFinishPosting}
              />
            </>)}
            composer={(textOpen() || (composerOpen() && mediaEntry()?.kind === "song")) && engagement.postingSession() !== undefined ? () => (
              <Show when={textOpen()} fallback={mediaComposer(true)}>
              <TextPostPanel
                draft={textDraft()}
                onClose={() => {
                  setTextOpen(false);
                  // Focus returns to the action that opened the composer.
                  queueMicrotask(() => document.querySelector<HTMLElement>("[data-community-post-slot]")?.focus());
                }}
                onDraftChange={setTextDraft}
                onPost={submitTextPost}
                onSong={file => openMediaComposer({ kind: "song", file })}
                onVideo={() => openMediaComposer({ kind: "video" })}
                unavailable={selectedPersonaId() === undefined ? "Choose a profile for this community before posting." : undefined}
              />
              </Show>
            ) : undefined}
            onVerifyAge={refreshAgeFeed}
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
              <Show when={engagement.postingSession()} fallback={render(<EngagementControls score={post.score} commentCount={post.commentCount ?? 0} busy={engagement.accountIdentity() !== null} onVote={requestGlobalSignIn} onComment={requestGlobalSignIn} />)}>
                {session => (
                  // Keep the same pills disabled until the account vote is known.
                  <Show when={viewerVoteFor(post.id) !== undefined && viewerVoteFor(post.id) !== "unavailable"} fallback={
                    <>
                      {render(<EngagementControls score={post.score} commentCount={post.commentCount ?? 0} busy onVote={() => {}} onComment={() => {}} />)}
                      <Show when={viewerVoteFor(post.id) === "unavailable"}>
                        <div role="status">
                          Your vote could not be checked.
                          <Button onClick={() => retryViewerVote(post.id)} size="sm" type="button">Retry vote</Button>
                        </div>
                      </Show>
                    </>
                  }>
                    <PostEngagement
                      canReportPost={post.supportsPostReports === true}
                      communityId={communityId}
                      personaId={selectedPersonaId()}
                      post={engagementPost(post, (() => {
                        const vote = viewerVoteFor(post.id);
                        return vote === 1 || vote === -1 ? vote : null;
                      })())}
                      principalId={session().userId}
                      transport={props.postEngagementTransport}
                    >{(controls, menuActions) => render(controls, menuActions)}</PostEngagement>
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
              the Post action, which retries the required profile read. */}
          <Toaster class="bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-4 md:end-20" />
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
          <Show when={personaStore === undefined}>
            <Show when={personaOptions().length > 1 || engagement.personaRetryAvailable()}>
              <CommunityPersonaControl
                label={engagement.personaRetryAvailable() ? "Retry profiles" : "Switch posting profile"}
                opensPicker
                persona={personaOptions().find(persona => persona.personaId === selectedPersonaId())}
                onClick={() => setLocalSwitcherOpen(true)}
              />
            </Show>
            <PersonaSwitcherSheet
              title="Profile in this community"
              open={localSwitcherOpen()}
              onOpenChange={setLocalSwitcherOpen}
              personas={personaOptions()}
              selectedPersonaId={selectedPersonaId() ?? ""}
              onSelect={personaId => { selectPersonaId(personaId); setLocalSwitcherOpen(false); }}
              loading={engagement.personaRetryBusy()}
              unavailable={engagement.personaRetryAvailable()}
              onRetry={() => void engagement.retryPersonas()}
            />
          </Show>
      </div>
      {/* The membership mode is stated visibly once, in the About card the
          shell renders from membershipMode. The names storefront link lived
          here invisibly for keyboard users only; it returns when it has a
          visible place on the page. */}
      <p class="sr-only" data-community-route={state.requestedPathSegment}>{state.routeDisplay}</p>
      <Show when={composerOpen() && mediaEntry()?.kind !== "song"}>
        {mediaComposer(false)}
      </Show>
    </div>
  );
}

function CommunityState(props: {
  readonly engagementApi: CommunityEngagementApi;
  readonly initialVideoSong?: { readonly postId: string };
  /** Clears the song-entry compose marker once its composer is dismissed. */
  readonly clearVideoSongIntent?: () => void;
  readonly composeText?: boolean;
  readonly state: CommunityPageViewState;
  readonly handleSalesClient: PublicHandleSalesApiClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly resolveOwnerSettingsAccess?: (communityId: string) => Promise<boolean>;
  readonly navigate?: (href: string) => void;
  readonly surfaceData?: Partial<CommunityData>;
  readonly loadThreads?: (communityId: string) => Promise<CommunityThreadPage>;
  readonly postEngagementTransport?: PostEngagementTransport;
  readonly viewerVoteClient?: CommunityViewerVoteClient;
  readonly textSubmissionTransport?: TextSubmissionTransport;
  readonly mediaSubmissionTransport?: MediaSubmissionTransport;
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
              initialVideoSong={props.initialVideoSong}
              clearVideoSongIntent={props.clearVideoSongIntent}
              composeText={props.composeText}
              state={state()}
              handleSalesClient={props.handleSalesClient}
              resolveSession={props.resolveSession}
              resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
              navigate={props.navigate}
              surfaceData={props.surfaceData}
              loadThreads={props.loadThreads}
              postEngagementTransport={props.postEngagementTransport}
              viewerVoteClient={props.viewerVoteClient}
              textSubmissionTransport={props.textSubmissionTransport}
              mediaSubmissionTransport={props.mediaSubmissionTransport}
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
      initialVideoSong={props.initialVideoSong}
      clearVideoSongIntent={props.clearVideoSongIntent}
      composeText={props.composeText}
      viewerVoteClient={props.viewerVoteClient}
      textSubmissionTransport={props.textSubmissionTransport}
      mediaSubmissionTransport={props.mediaSubmissionTransport}
      state={state()}
      handleSalesClient={handleSalesClient}
      resolveSession={props.resolveSession}
      resolveOwnerSettingsAccess={props.resolveOwnerSettingsAccess}
      navigate={props.navigate}
      surfaceData={props.surfaceData}
      loadThreads={props.loadThreads}
      postEngagementTransport={props.postEngagementTransport}
    />
  );
}

export function CommunityPage(props: CommunityPageProps) {
  return <Loading fallback={<LoadingState />}><CommunityData {...props} /></Loading>;
}

export default CommunityPage;
