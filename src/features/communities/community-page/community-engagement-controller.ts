import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

import { ApiClientError } from "@pirate/api-client";
import {
  resolveSession as resolveApplicationSession,
  sessionPersonasUnavailable,
  refreshSession,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../../api/session.ts";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { useApplicationSession } from "../../shell/application-session.tsx";
import {
  defaultCommunityPersonaChoice,
  communityJoinCandidates,
  PERSONA_CREATION_UNAVAILABLE,
  type CommunityPersonaChoice,
} from "../../identity/community-persona-choice.ts";
import type {
  CommunityEngagementApi,
  CommunityMembershipState,
} from "./community-engagement-api.ts";

type EngagementMembership = CommunityMembershipState | "pending" | "blocked";

export interface CommunityEngagementController {
  readonly following: Accessor<boolean>;
  readonly followerCount: Accessor<number>;
  readonly followBusy: Accessor<boolean>;
  readonly joinBusy: Accessor<boolean>;
  readonly joinDisabled: Accessor<boolean>;
  readonly joined: Accessor<boolean>;
  readonly joinLabel: Accessor<string>;
  readonly message: Accessor<string>;
  readonly error: Accessor<string>;
  readonly personaRetryAvailable: Accessor<boolean>;
  readonly personaRetryBusy: Accessor<boolean>;
  retryPersonas(): Promise<void>;
  readonly postingSession: Accessor<AuthenticatedSession | undefined>;
  /** undefined before the first account resolution, null while anonymous. */
  readonly accountIdentity: Accessor<string | null | undefined>;
  /**
   * True while the viewer's account or membership is still being established.
   * Surfaces render their private controls as reserved space while this holds,
   * because "not a member" and "not signed in" are claims, not defaults.
   */
  readonly authorityPending: Accessor<boolean>;
  /** Open while a terminal join waits for the account's closed persona choice. */
  readonly joinPersonaStep: Accessor<boolean>;
  readonly joinPersonaChoice: Accessor<CommunityPersonaChoice | undefined>;
  readonly joinedPersonaId: Accessor<string | undefined>;
  followToggle(): Promise<void>;
  joinCommunity(persona?: CommunityPersonaChoice): Promise<void>;
  confirmJoinPersona(choice: CommunityPersonaChoice): void;
  cancelJoinPersona(): void;
  resolvePostingSession(): Promise<AuthenticatedSession | undefined>;
}

export interface CommunityEngagementControllerOptions {
  readonly api: CommunityEngagementApi;
  readonly communityId: string;
  readonly initialFollowerCount: number;
  readonly membershipMode: "open" | "request" | "gated";
  readonly navigate: (href: string) => void;
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly returnTo: string;
}

export function createCommunityEngagementController(
  options: CommunityEngagementControllerOptions,
): CommunityEngagementController {
  const applicationSession = useApplicationSession();
  const [following, setFollowing] = createSignal(false);
  const [membership, setMembership] = createSignal<EngagementMembership>("unknown");
  const [followerCount, setFollowerCount] = createSignal(options.initialFollowerCount);
  const [busy, setBusy] = createSignal<"follow" | "join">();
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [profilesUnavailable, setProfilesUnavailable] = createSignal(false);
  const [personaRetryBusy, setPersonaRetryBusy] = createSignal(false);
  let personaRetryInFlight = false;
  const [viewerReady, setViewerReady] = createSignal(false);
  // Distinct from viewerReady: a failed read settles the question of whether
  // the page is still waiting, even though it leaves membership unknown. The
  // established recovery is an action retry, so the controls stay actionable
  // behind the error rather than reserved forever.
  const [viewerSettled, setViewerSettled] = createSignal(false);
  const [postingSession, setPostingSession] = createSignal<AuthenticatedSession>();
  const [accountAuthenticated, setAccountAuthenticated] = createSignal(false);
  const [joinPersonaOpen, setJoinPersonaOpen] = createSignal(false);
  const [joinPersonaChoice, setJoinPersonaChoice] = createSignal<CommunityPersonaChoice>();
  const [joinedPersonaId, setJoinedPersonaId] = createSignal<string>();
  // Reactive for consumers; the plain mirror below is what control flow reads,
  // because a signal write is not visible to a read in the same tick.
  const [accountIdentity, setAccountIdentity] = createSignal<string | null>();
  let active = true;
  let actionInFlight = false;
  let fullSessionStarted = false;
  let sessionRequest = 0;
  let viewerRequest = 0;
  /** undefined until the first account resolution, then the id or null. */
  let observedAccountIdentity: string | null | undefined;
  /** Mirrors whether postingSession holds a value, for same-tick guards. */
  let personasResolved = false;
  /**
   * Retires an action that is still awaiting when the account changes. The read
   * generations cover reads; an action also commits membership, counts,
   * messages and busy state, none of which belong to the incoming account.
   */
  let actionGeneration = 0;

  /** True while the action that captured this generation still owns the state. */
  const actionOwns = (generation: number) => active && generation === actionGeneration;

  const assignPostingSession = (next: AuthenticatedSession | undefined) => {
    personasResolved = next !== undefined;
    setPostingSession(next);
  };

  onCleanup(() => {
    active = false;
    sessionRequest += 1;
    viewerRequest += 1;
  });

  const refreshViewerState = async (): Promise<boolean> => {
    const request = ++viewerRequest;
    try {
      const viewer = await options.api.readViewerState(options.communityId);
      if (!active || request !== viewerRequest) return false;
      setMembership(viewer.membership);
      setFollowing(viewer.following);
      if (viewer.followerCount !== null) setFollowerCount(viewer.followerCount);
      setViewerReady(true);
      setViewerSettled(true);
      setError("");
      return true;
    } catch {
      if (active && request === viewerRequest) {
        setViewerReady(false);
        setViewerSettled(true);
        setError("We couldn't load your current Community membership. Retry an action to check again.");
      }
      return false;
    }
  };

  // Membership, follow state, counts, personas and the join step are all scoped
  // to one account. Signing out or changing account invalidates every one of
  // them: without this a signed-out page kept rendering Joined and Post here,
  // and a second account inherited the first account's viewer state because
  // viewer readiness never fell back to false.
  const clearAccountScopedState = () => {
    setMembership("unknown");
    setFollowing(false);
    setFollowerCount(options.initialFollowerCount);
    setViewerReady(false);
    setViewerSettled(false);
    setProfilesUnavailable(false);
    setJoinedPersonaId(undefined);
    setJoinPersonaOpen(false);
    setJoinPersonaChoice(undefined);
    assignPostingSession(undefined);
    fullSessionStarted = false;
    // Retire reads issued for the previous identity through the existing
    // generation guards, so one already in flight cannot land afterwards.
    sessionRequest += 1;
    viewerRequest += 1;
    // An action in flight for the previous account is retired the same way,
    // and the busy state it owned is released so the incoming account is not
    // left looking mid-action.
    actionGeneration += 1;
    actionInFlight = false;
    personaRetryInFlight = false;
    setBusy(undefined);
    setPersonaRetryBusy(false);
  };

  const applyAccountSession = (resolved: "anonymous" | Readonly<{ status: "authenticated"; userId: string }>) => {
    const identity = resolved === "anonymous" ? null : resolved.userId;
    const changed = observedAccountIdentity !== undefined && observedAccountIdentity !== identity;
    observedAccountIdentity = identity;
    setAccountIdentity(identity);
    if (changed) {
      // An action outcome belongs to the account that produced it.
      setMessage("");
      setError("");
    }
    if (identity === null) {
      setAccountAuthenticated(false);
      clearAccountScopedState();
      return;
    }
    setAccountAuthenticated(true);
    if (changed) {
      // The clear above just retired viewer readiness, so read nothing back:
      // this account needs its own viewer state either way.
      clearAccountScopedState();
      void refreshViewerState();
      return;
    }
    if (!viewerReady()) void refreshViewerState();
  };

  const applyFullSession = (resolved: SessionResolution) => {
    // The account transition runs first, so the state it clears cannot take
    // the personas resolved for the incoming identity with it.
    applyAccountSession(resolved);
    if (sessionPersonasUnavailable(resolved)) {
      assignPostingSession(undefined);
      setProfilesUnavailable(true);
    } else if (resolved !== "anonymous") {
      setProfilesUnavailable(false);
      assignPostingSession(resolved);
    }
  };

  const hydrateFullSession = () => {
    if (fullSessionStarted || personasResolved) return;
    fullSessionStarted = true;
    const request = ++sessionRequest;
    void (options.resolveSession ?? resolveApplicationSession)()
      .then(result => {
        if (!active || request !== sessionRequest) return;
        if (result !== "anonymous") applyFullSession(result);
      })
      .catch(() => {
        if (active && request === sessionRequest) {
          setProfilesUnavailable(true);
        }
      });
  };

  createEffect(
    () => applicationSession(),
    (resolved) => {
      if (resolved === undefined) {
        if (options.resolveSession === undefined) return;
        const request = ++sessionRequest;
        void options.resolveSession()
          .then(result => { if (active && request === sessionRequest) applyFullSession(result); })
          .catch(() => { if (active && request === sessionRequest) setError("We couldn't verify your session."); });
        return;
      }
      if (resolved === "resolving") return;
      // Applied off the effect's apply phase: an account resolution that is
      // already settled at mount would otherwise write these signals inside an
      // owned scope, which halts the reactive system rather than transitioning.
      queueMicrotask(() => {
        if (!active) return;
        if (resolved === "failed") {
          // No established identity: everything scoped to the account that was
          // here goes with it, exactly as a sign-out would take it.
          applyAccountSession("anonymous");
          setError("We couldn't check your account. Use Retry account check to reconnect.");
          return;
        }
        applyAccountSession(resolved);
        if (resolved !== "anonymous") hydrateFullSession();
      });
    },
  );

  const hasAuthenticatedAccount = async (): Promise<boolean> => {
    if (accountAuthenticated()) return true;
    const fromApplication = applicationSession();
    if (fromApplication !== undefined && fromApplication !== "resolving") {
      if (fromApplication === "failed") {
        setError("We couldn't check your account. Use Retry account check to reconnect.");
        return false;
      }
      if (fromApplication === "anonymous") {
        requestGlobalSignIn();
        return false;
      }
      applyAccountSession(fromApplication);
      return true;
    }
    const request = ++sessionRequest;
    try {
      const resolved = await (options.resolveSession ?? resolveApplicationSession)();
      if (!active || request !== sessionRequest) return false;
      if (resolved === "anonymous") {
        requestGlobalSignIn();
        return false;
      }
      applyFullSession(resolved);
      return true;
    } catch {
      if (active && request === sessionRequest) setError("We couldn't verify your session. Try again.");
      return false;
    }
  };

  const followToggle = async (): Promise<void> => {
    if (actionInFlight) return;
    actionInFlight = true;
    const generation = actionGeneration;
    try {
      if (!await hasAuthenticatedAccount() || !actionOwns(generation)) return;
      if (!viewerReady() && !await refreshViewerState()) return;
      if (!actionOwns(generation)) return;
      setBusy("follow");
      setError("");
      setMessage("");
      const result = following()
        ? await options.api.unfollow(options.communityId)
        : await options.api.follow(options.communityId);
      if (!actionOwns(generation)) return;
      setFollowing(result.following);
      if (result.followerCount !== null) setFollowerCount(result.followerCount);
      setMessage(result.following ? "Following this Community." : "Community unfollowed.");
    } catch {
      if (actionOwns(generation)) setError("We couldn't update your follow. Nothing changed.");
    } finally {
      // A retired generation released the busy state at the transition; taking
      // it back would clear whatever the incoming account started.
      if (actionOwns(generation)) {
        actionInFlight = false;
        setBusy(undefined);
      }
    }
  };

  const joinCommunity = async (persona?: CommunityPersonaChoice): Promise<void> => {
    if (actionInFlight || membership() === "member") return;
    actionInFlight = true;
    const generation = actionGeneration;
    try {
      if (!await hasAuthenticatedAccount() || !actionOwns(generation) || membership() === "member") return;
      if (!viewerReady() && !await refreshViewerState()) return;
      if (!actionOwns(generation) || membership() === "member") return;
      setBusy("join");
      setError("");
      setMessage("");
      const action = await options.api.resolveJoinAction(options.communityId);
      if (!actionOwns(generation)) return;
      if (action.kind === "joined") {
        setMembership("member");
        setMessage("You are already a member.");
        return;
      }
      if (action.kind === "pending") {
        setMembership("pending");
        setMessage("Your membership request is pending.");
        return;
      }
      if (action.kind === "blocked") {
        setMembership(action.reason === "banned" ? "banned" : "blocked");
        setError(action.reason === "banned"
          ? "This account cannot join this Community."
          : "The Community requirements are not satisfied.");
        return;
      }
      if (action.kind === "verify") {
        if (action.providerId !== "very.web") {
          setError("This Community's verification provider is not available in the app yet.");
          return;
        }
        const query = new URLSearchParams({ community_id: options.communityId, return_to: options.returnTo });
        options.navigate(`/verify/very?${query.toString()}`);
        return;
      }
      // Spec 014 §11.2: the terminal membership commit carries the closed
      // persona choice; a request-mode join never carries one because an
      // intent does not pre-bind identity.
      let choice = action.kind === "request" ? undefined : persona;
      if (action.kind === "join") {
        if (choice?.kind === "create_new") {
          setError(PERSONA_CREATION_UNAVAILABLE);
          setJoinPersonaChoice(undefined);
          setJoinPersonaOpen(true);
          return;
        }
        const session = await resolvePersonaSession();
        if (!actionOwns(generation) || session === undefined) return;
        const candidates = communityJoinCandidates(session.personas, options.communityId);
        const selectedId = choice?.kind === "existing" ? choice.personaId : undefined;
        if (selectedId !== undefined && !candidates.some(candidate => candidate.personaId === selectedId)) {
          setError("Choose a persona bound to this community or an unbound persona.");
          setJoinPersonaOpen(true);
          return;
        }
        choice ??= defaultCommunityPersonaChoice(candidates);
        if (choice === undefined || (persona === undefined && choice.kind === "create_new")) {
          // No global default; minting is unavailable until wallet activation.
          setJoinPersonaChoice(undefined);
          setJoinPersonaOpen(true);
          return;
        }
      }
      const result = await options.api.join(options.communityId, choice);
      if (!actionOwns(generation)) return;
      if (result.status === "joined") {
        setMembership("member");
        setJoinedPersonaId(result.personaId ?? undefined);
        setMessage("Joined this Community.");
        // Read the minted profile/binding from the server, never manufacture it
        // from the command response. A read failure must not undo a joined state.
        refreshSession();
        assignPostingSession(undefined);
        fullSessionStarted = false;
        hydrateFullSession();
        // The join result proves membership, not a subscription count.
        // A failed preview must not undo the committed membership.
        await refreshViewerState();
      } else {
        setMembership("pending");
        setMessage("Membership request sent.");
      }
    } catch (error) {
      if (actionOwns(generation)) setError(error instanceof ApiClientError && error.status === 409
        ? "That persona is already active in another community. Choose a different persona or create a new one."
        : "We couldn't complete the membership action. Nothing changed.");
    } finally {
      if (actionOwns(generation)) {
        actionInFlight = false;
        setBusy(undefined);
      }
    }
  };

  const confirmJoinPersona = (choice: CommunityPersonaChoice) => {
    setJoinPersonaOpen(false);
    void joinCommunity(choice);
  };

  const cancelJoinPersona = () => setJoinPersonaOpen(false);

  const resolvePersonaSession = async (): Promise<AuthenticatedSession | undefined> => {
    if (!await hasAuthenticatedAccount()) return undefined;
    const cached = personasResolved ? postingSession() : undefined;
    if (cached !== undefined) return cached;
    const request = ++sessionRequest;
    try {
      const resolved = await (options.resolveSession ?? resolveApplicationSession)();
      if (!active || request !== sessionRequest) return undefined;
      if (resolved === "anonymous") {
        requestGlobalSignIn();
        return undefined;
      }
      applyFullSession(resolved);
      if (sessionPersonasUnavailable(resolved)) return undefined;
      return resolved;
    } catch {
      if (active && request === sessionRequest) setError("We couldn't verify your session. Try again.");
      return undefined;
    }
  };

  const resolvePostingSession = async (): Promise<AuthenticatedSession | undefined> => {
    if (!await hasAuthenticatedAccount()) return undefined;
    if (!await refreshViewerState() || membership() !== "member") {
      if (active && viewerReady()) setError("Join this Community before posting.");
      return undefined;
    }
    return resolvePersonaSession();
  };

  const retryPersonas = async () => {
    if (personaRetryInFlight) return;
    personaRetryInFlight = true;
    const generation = actionGeneration;
    setPersonaRetryBusy(true);
    setError("");
    setMessage("");
    try {
      await resolvePersonaSession();
    } finally {
      // personaRetryInFlight is the concurrency guard, not just presentation:
      // releasing it from a retired generation would hand the incoming
      // account's ownership away and let a duplicate retry through.
      if (actionOwns(generation)) {
        personaRetryInFlight = false;
        setPersonaRetryBusy(false);
      }
    }
  };

  const joined = () => membership() === "member";
  // Unresolved account, or an account whose viewer state has not been read.
  const authorityPending = () => accountIdentity() === undefined
    || (accountAuthenticated() && !viewerSettled());
  const joinDisabled = () => membership() === "pending" || membership() === "banned" || membership() === "blocked";
  const joinLabel = () => {
    if (membership() === "pending") return "Request pending";
    if (membership() === "banned" || membership() === "blocked") return "Unavailable";
    if (options.membershipMode === "request") return "Request to join";
    if (options.membershipMode === "gated") return "Verify to join";
    return "Join";
  };

  return {
    following,
    followerCount,
    followBusy: () => busy() === "follow",
    joinBusy: () => busy() === "join",
    joinDisabled,
    joined,
    joinLabel,
    joinPersonaStep: joinPersonaOpen,
    joinPersonaChoice,
    joinedPersonaId,
    message,
    // Action outcomes take precedence without changing profile availability.
    error: () => error() || (!message() && profilesUnavailable()
      ? "We couldn't load your active personas. Retry profiles before commenting, posting or joining."
      : ""),
    postingSession,
    accountIdentity,
    authorityPending,
    personaRetryAvailable: profilesUnavailable,
    personaRetryBusy,
    retryPersonas,
    followToggle,
    joinCommunity,
    confirmJoinPersona,
    cancelJoinPersona,
    resolvePostingSession,
  };
}
