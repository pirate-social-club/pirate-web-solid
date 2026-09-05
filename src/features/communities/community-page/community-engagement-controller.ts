import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

import { ApiClientError } from "@pirate/api-client";
import {
  resolveSession as resolveApplicationSession,
  refreshSession,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../../api/session.ts";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { useApplicationSession } from "../../shell/application-session.tsx";
import {
  defaultCommunityPersonaChoice,
  communityJoinCandidates,
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
  readonly postingSession: Accessor<AuthenticatedSession | undefined>;
  /** Open while a terminal join waits for the account's closed persona choice. */
  readonly joinPersonaStep: Accessor<boolean>;
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
  const [viewerReady, setViewerReady] = createSignal(false);
  const [postingSession, setPostingSession] = createSignal<AuthenticatedSession>();
  const [accountAuthenticated, setAccountAuthenticated] = createSignal(false);
  const [joinPersonaOpen, setJoinPersonaOpen] = createSignal(false);
  const [joinedPersonaId, setJoinedPersonaId] = createSignal<string>();
  let active = true;
  let actionInFlight = false;
  let fullSessionStarted = false;
  let sessionRequest = 0;
  let viewerRequest = 0;

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
      setError("");
      return true;
    } catch {
      if (active && request === viewerRequest) {
        setViewerReady(false);
        setError("We couldn't load your current Community membership. Retry an action to check again.");
      }
      return false;
    }
  };

  const applyAccountSession = (resolved: "anonymous" | Readonly<{ status: "authenticated"; userId: string }>) => {
    if (resolved === "anonymous") {
      setAccountAuthenticated(false);
      setPostingSession(undefined);
      setViewerReady(false);
      return;
    }
    setAccountAuthenticated(true);
    if (!viewerReady()) void refreshViewerState();
  };

  const applyFullSession = (resolved: SessionResolution) => {
    if (resolved !== "anonymous") setPostingSession(resolved);
    applyAccountSession(resolved);
  };

  const hydrateFullSession = () => {
    if (fullSessionStarted || postingSession() !== undefined) return;
    fullSessionStarted = true;
    const request = ++sessionRequest;
    void (options.resolveSession ?? resolveApplicationSession)()
      .then(result => {
        if (!active || request !== sessionRequest) return;
        if (result !== "anonymous") applyFullSession(result);
      })
      .catch(() => {
        if (active && request === sessionRequest) {
          setError("We couldn't load your active personas. Retry before commenting or posting.");
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
      if (resolved !== "resolving") {
        applyAccountSession(resolved);
        if (resolved !== "anonymous") hydrateFullSession();
      }
    },
  );

  const hasAuthenticatedAccount = async (): Promise<boolean> => {
    if (accountAuthenticated()) return true;
    const fromApplication = applicationSession();
    if (fromApplication !== undefined && fromApplication !== "resolving") {
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
    try {
      if (!await hasAuthenticatedAccount()) return;
      if (!viewerReady() && !await refreshViewerState()) return;
      setBusy("follow");
      setError("");
      setMessage("");
      const result = following()
        ? await options.api.unfollow(options.communityId)
        : await options.api.follow(options.communityId);
      if (!active) return;
      setFollowing(result.following);
      if (result.followerCount !== null) setFollowerCount(result.followerCount);
      setMessage(result.following ? "Following this Community." : "Community unfollowed.");
    } catch {
      if (active) setError("We couldn't update your follow. Nothing changed.");
    } finally {
      actionInFlight = false;
      if (active) setBusy(undefined);
    }
  };

  const joinCommunity = async (persona?: CommunityPersonaChoice): Promise<void> => {
    if (actionInFlight || membership() === "member") return;
    actionInFlight = true;
    try {
      if (!await hasAuthenticatedAccount() || membership() === "member") return;
      if (!viewerReady() && !await refreshViewerState()) return;
      if (membership() === "member") return;
      setBusy("join");
      setError("");
      setMessage("");
      const action = await options.api.resolveJoinAction(options.communityId);
      if (!active) return;
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
      // Spec 014 §10.2: the terminal membership commit carries the closed
      // persona choice; a request-mode join never carries one because an
      // intent does not pre-bind identity.
      let choice = action.kind === "request" ? undefined : persona;
      if (action.kind === "join") {
        const session = await resolvePersonaSession();
        if (!active || session === undefined) return;
        const candidates = communityJoinCandidates(session.personas, options.communityId);
        const selectedId = choice?.kind === "existing" ? choice.personaId : undefined;
        if (selectedId !== undefined && !candidates.some(candidate => candidate.personaId === selectedId)) {
          setError("Choose a persona bound to this community or an unbound persona.");
          setJoinPersonaOpen(true);
          return;
        }
        choice ??= defaultCommunityPersonaChoice(candidates);
        if (choice === undefined) {
          // Several scoped candidates remain; do not use a global default.
          setJoinPersonaOpen(true);
          return;
        }
      }
      const result = await options.api.join(options.communityId, choice);
      if (!active) return;
      if (result.status === "joined") {
        setMembership("member");
        if (!following()) setFollowerCount(count => count + 1);
        setFollowing(true);
        setJoinedPersonaId(result.personaId ?? undefined);
        setMessage("Joined this Community.");
        // Read the minted profile/binding from the server, never manufacture it
        // from the command response. A read failure must not undo a joined state.
        refreshSession();
        setPostingSession(undefined);
        fullSessionStarted = false;
        hydrateFullSession();
      } else {
        setMembership("pending");
        setMessage("Membership request sent.");
      }
    } catch (error) {
      if (active) setError(error instanceof ApiClientError && error.status === 409
        ? "That persona is already active in another community. Choose a different persona or create a new one."
        : "We couldn't complete the membership action. Nothing changed.");
    } finally {
      actionInFlight = false;
      if (active) setBusy(undefined);
    }
  };

  const confirmJoinPersona = (choice: CommunityPersonaChoice) => {
    setJoinPersonaOpen(false);
    void joinCommunity(choice);
  };

  const cancelJoinPersona = () => setJoinPersonaOpen(false);

  const resolvePersonaSession = async (): Promise<AuthenticatedSession | undefined> => {
    if (!await hasAuthenticatedAccount()) return undefined;
    const cached = postingSession();
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

  const joined = () => membership() === "member";
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
    joinedPersonaId,
    message,
    error,
    postingSession,
    followToggle,
    joinCommunity,
    confirmJoinPersona,
    cancelJoinPersona,
    resolvePostingSession,
  };
}
