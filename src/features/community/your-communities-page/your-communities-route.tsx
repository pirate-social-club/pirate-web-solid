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
  type AccountSessionResolution,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../../api/session.ts";
import { Button, Type } from "../../../design-system.ts";
import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import { CreatePostDialog } from "../../posts/post-composer/create-post-dialog.tsx";
import {
  useApplicationSession,
  type ApplicationSessionState,
} from "../../shell/application-session.tsx";
import { YourCommunitiesPageView, type YourCommunitySummary } from "./your-communities-page.tsx";

type MembershipRouteState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{ kind: "ready"; memberships: readonly AccountCommunityMembership[] }>
  | Readonly<{ kind: "error"; message: string }>;

export interface YourCommunitiesRouteProps {
  readonly applicationSession?: Accessor<ApplicationSessionState | undefined>;
  readonly loadMemberships?: () => Promise<readonly AccountCommunityMembership[]>;
  readonly resolvePostingSession?: () => Promise<SessionResolution>;
  readonly navigate?: (href: string) => void;
}

function summary(membership: AccountCommunityMembership): YourCommunitySummary {
  return {
    communityId: membership.community_id,
    displayName: membership.display_name,
    resourceHref: membership.resource_href ?? membership.canonical_route?.href ?? null,
    routeSlug: membership.canonical_route?.path_segment ?? null,
  };
}

export function YourCommunitiesRouteView(props: YourCommunitiesRouteProps = {}) {
  const inheritedSession = useApplicationSession();
  const session = props.applicationSession ?? inheritedSession;
  const loadMemberships = props.loadMemberships ?? (() => loadAccountCommunityMemberships());
  const resolvePostingSession = props.resolvePostingSession ?? resolveApplicationSession;
  const [state, setState] = createSignal<MembershipRouteState>({ kind: "loading" });
  const [composerOpen, setComposerOpen] = createSignal(false);
  const [selectedMembership, setSelectedMembership] = createSignal<AccountCommunityMembership>();
  const [postingSession, setPostingSession] = createSignal<AuthenticatedSession>();
  const [postingCommunityId, setPostingCommunityId] = createSignal<string>();
  const [actionError, setActionError] = createSignal("");
  let active = true;
  let loadRequest = 0;
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
          setState({ kind: "error", message: "We couldn't load your Communities. Try again." });
        }
      });
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
        load(current);
      });
    },
  );

  const memberships = createMemo(() => {
    const current = state();
    return current.kind === "ready" ? current.memberships : [];
  });
  const joinedCommunities = createMemo(() => memberships().map(summary));
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
    if (account === undefined || account === "resolving" || account === "anonymous") return;
    const epoch = loadRequest;
    const isCurrent = () => {
      const current = session();
      return active && epoch === loadRequest && current !== undefined &&
        current !== "resolving" && current !== "anonymous" && current.userId === account.userId;
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

  return (
    <main data-route-path="/communities" data-communities-state={state().kind}>
      <Title>Your Communities | Pirate</Title>
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
            Your Communities
          </Type>
          <Type as="p">Sign in to choose a Community and post.</Type>
          <Button class="w-fit" onClick={requestGlobalSignIn}>
            Sign in
          </Button>
        </PageContainer>
      </Show>
      <Show when={state().kind === "error"}>
        <PageContainer class="flex flex-col gap-4">
          <Type as="h1" variant="h1">
            Your Communities
          </Type>
          <Type as="p" role="alert">
            {errorMessage()}
          </Type>
        </PageContainer>
      </Show>
      <Show when={state().kind === "ready"}>
        <YourCommunitiesPageView
          createCommunityLabel="Create Community"
          emptyFollowingLabel="Following Communities will appear here."
          emptyJoinedLabel="You aren't an active member of a Community yet."
          followingCommunities={[]}
          followingLabel="Following"
          joinedCommunities={joinedCommunities()}
          joinedLabel="Joined"
          onCreateCommunity={() => navigate("/communities/new")}
          onPostHere={(community) => void openPostComposer(community)}
          onSelectCommunity={(community) => {
            if (community.resourceHref !== null && community.resourceHref !== undefined)
              navigate(community.resourceHref);
          }}
          title="Your Communities"
        />
      </Show>
      <Show when={postingCommunityId()}>
        <p class="sr-only" role="status">
          Checking posting access…
        </p>
      </Show>
      <Show when={actionError()}>
        {(message) => (
          <p class="mx-5 text-sm text-destructive" role="alert">
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
                onOpenChange={setComposerOpen}
                open={composerOpen()}
                personas={resolved().personas}
                principalId={resolved().userId}
              />
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
