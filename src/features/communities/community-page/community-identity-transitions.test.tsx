import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AuthenticatedSession, SessionResolution } from "../../../api/session.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import type { CommunityEngagementApi, CommunityMembershipState } from "./community-engagement-api.ts";
import { createMemoryMediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import {
  createCommunityEngagementController,
  type CommunityEngagementController,
} from "./community-engagement-controller.ts";
import type { CommunityThreadPage } from "./community-thread-feed-api.ts";
import CommunityPage from "./community-page.tsx";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => { dispose(); container.remove(); });
  return container;
}

interface CommunityFixture {
  readonly pathSegment: string;
  readonly communityId: string;
  readonly displayName: string;
  readonly threadTitle: string;
}

const harbor: CommunityFixture = {
  pathSegment: "harbor",
  communityId: "community_123e4567-e89b-42d3-a456-426614174000",
  displayName: "Pirate Harbor",
  threadTitle: "Harbor thread",
};

const lagoon: CommunityFixture = {
  pathSegment: "lagoon",
  communityId: "community_223e4567-e89b-42d3-a456-426614174001",
  displayName: "Blue Lagoon",
  threadTitle: "Lagoon thread",
};

const fixtures = [harbor, lagoon];

function fixtureFor(value: string): CommunityFixture {
  const found = fixtures.find(entry => entry.pathSegment === value || entry.communityId === value);
  if (found === undefined) throw new Error(`no community fixture for ${value}`);
  return found;
}

const routeClient = {
  get_cPathSegment: async (
    { path }: { path: { path_segment: string } },
  ): Promise<GetCPathSegmentResponse> => {
    const fixture = fixtureFor(path.path_segment);
    return {
      community_id: fixture.communityId,
      canonical_route: {
        family: "hns",
        root_label: fixture.pathSegment,
        root_label_display: fixture.pathSegment,
        path_segment: fixture.pathSegment,
        href: `/c/${fixture.pathSegment}`,
        app_host: `app.${fixture.pathSegment}`,
      },
    };
  },
  get_communitiesCommunityIdPreview: async (
    { path }: { path: { communityId: string } },
  ): Promise<GetCommunitiesCommunityIdPreviewResponse> => {
    const fixture = fixtureFor(path.communityId);
    return {
      id: fixture.communityId,
      object: "community_preview",
      display_name: fixture.displayName,
      description: "Public conversations.",
      membership_mode: "open",
      human_verification_lane: null,
      member_count: 12,
      follower_count: 20,
      moderators: [],
      membership_gate_summaries: [],
      rules: [],
      created: 1_700_000_000,
    };
  },
};

const handleSalesClient = {
  get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }),
};

const loadThreads = async (communityId: string): Promise<CommunityThreadPage> => ({
  posts: [{
    id: `thread-${communityId}`,
    title: fixtureFor(communityId).threadTitle,
    body: "Public feed content.",
    score: 3,
    publishedAt: "2026-09-01T18:00:00.000Z",
    commentCount: 0,
  }],
  nextCursor: null,
});

/** Membership and follow state keyed by account, the way the server holds it. */
function accountScopedEngagementApi(
  members: ReadonlyMap<string, ReadonlySet<string>>,
  currentAccount: () => string | null,
) {
  const membership = (communityId: string): CommunityMembershipState => {
    const account = currentAccount();
    if (account === null) return "not_member";
    return members.get(account)?.has(communityId) === true ? "member" : "not_member";
  };
  const readViewerState = vi.fn(async (communityId: string) => ({
    membership: membership(communityId),
    following: membership(communityId) === "member",
    followerCount: 20,
  }));
  const api: CommunityEngagementApi = {
    readViewerState,
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona-1" })),
    follow: vi.fn(async () => ({ following: true, followerCount: 21 })),
    unfollow: vi.fn(async () => ({ following: false, followerCount: 20 })),
  };
  return { api, readViewerState };
}

/** A persona bound to this community, which is what a persona control needs. */
function boundPersona(personaId: string, displayName: string, communityId: string) {
  return {
    personaId,
    displayName,
    avatarRef: null,
    primaryPublicHandle: null,
    communityBinding: { communityId, bindingSource: "first_membership" as const },
  };
}

const sessionFor = (userId: string, personaId: string, communityId: string): AuthenticatedSession => ({
  status: "authenticated",
  userId,
  personas: [boundPersona(personaId, `${userId} voice`, communityId)],
});

function joinLabelButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button"))
    .find(button => ["Join", "Joined", "Checking…"].includes(button.textContent?.trim() ?? ""));
}

function hasButton(container: HTMLElement, label: string): boolean {
  return Array.from(container.querySelectorAll("button"))
    .some(button => button.textContent?.trim() === label);
}

describe("navigating between communities on the same route", () => {
  test("community B never inherits community A's membership, feed or management authority", async () => {
    const [pathSegment, setPathSegment] = createSignal(harbor.pathSegment);
    // The account owns and belongs to A only.
    const { api: engagementApi } = accountScopedEngagementApi(
      new Map([["account-a", new Set([harbor.communityId])]]),
      () => "account-a",
    );
    const resolveOwnerSettingsAccess = vi.fn(async (communityId: string) =>
      communityId === harbor.communityId);

    const container = render(() => (
      <CommunityPage
        client={routeClient}
        engagementApi={engagementApi}
        handleSalesClient={handleSalesClient}
        loadThreads={loadThreads}
        pathSegment={pathSegment()}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        resolveOwnerSettingsAccess={resolveOwnerSettingsAccess}
        resolveSession={async (): Promise<SessionResolution> => sessionFor("account-a", "persona-a", harbor.communityId)}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.displayName));
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Joined"));
    await vi.waitFor(() => expect(hasButton(container, "Manage")).toBe(true));
    expect(container.textContent).toContain(harbor.threadTitle);
    expect(hasButton(container, "Post here")).toBe(true);
    expect(container.querySelector("[data-operation-persona]")).not.toBeNull();

    setPathSegment(lagoon.pathSegment);

    await vi.waitFor(() => expect(container.textContent).toContain(lagoon.displayName));
    // Everything below was scoped to the community that is no longer here.
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    await vi.waitFor(() => expect(container.textContent).toContain(lagoon.threadTitle));
    expect(container.textContent).not.toContain(harbor.threadTitle);
    expect(container.textContent).not.toContain(harbor.displayName);
    expect(hasButton(container, "Manage")).toBe(false);
    expect(hasButton(container, "Post here")).toBe(false);
    expect(container.querySelector("[data-community-route='lagoon']")).not.toBeNull();
    expect(resolveOwnerSettingsAccess).toHaveBeenCalledWith(lagoon.communityId);
  });
});

describe("account identity transitions on one community", () => {
  test("signing out drops membership, posting and management without a reload", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account: string | null = "account-a";
    const { api: engagementApi } = accountScopedEngagementApi(
      new Map([["account-a", new Set([harbor.communityId])]]),
      () => account,
    );

    const container = render(() => (
      <ApplicationSessionProvider state={sessionState}>
        <CommunityPage
          client={routeClient}
          engagementApi={engagementApi}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveOwnerSettingsAccess={async () => account === "account-a"}
          resolveSession={async (): Promise<SessionResolution> =>
            account === null ? "anonymous" : sessionFor(account, "persona-a", harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Joined"));
    await vi.waitFor(() => expect(hasButton(container, "Manage")).toBe(true));
    await vi.waitFor(() => expect(container.querySelector("[data-operation-persona]")).not.toBeNull());
    expect(hasButton(container, "Post here")).toBe(true);

    account = null;
    setSessionState("anonymous");

    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    expect(hasButton(container, "Post here")).toBe(false);
    expect(hasButton(container, "Manage")).toBe(false);
    expect(container.querySelector("[data-operation-persona]")).toBeNull();
    // The public feed is not account-scoped and must survive the transition.
    expect(container.textContent).toContain(harbor.threadTitle);
  });

  test("a second account never inherits the first account's viewer state", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account = "account-a";
    const { api: engagementApi, readViewerState } = accountScopedEngagementApi(
      new Map([["account-a", new Set([harbor.communityId])]]),
      () => account,
    );

    const container = render(() => (
      <ApplicationSessionProvider state={sessionState}>
        <CommunityPage
          client={routeClient}
          engagementApi={engagementApi}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveOwnerSettingsAccess={async () => account === "account-a"}
          resolveSession={async (): Promise<SessionResolution> => sessionFor(account, `persona-${account}`, harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Joined"));
    await vi.waitFor(() => expect(hasButton(container, "Manage")).toBe(true));
    const viewerReadsForFirstAccount = readViewerState.mock.calls.length;

    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });

    // Account B belongs to nothing here, so the viewer state must be re-read
    // rather than carried over from the account that was signed in before.
    await vi.waitFor(() => expect(readViewerState.mock.calls.length)
      .toBeGreaterThan(viewerReadsForFirstAccount));
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    expect(hasButton(container, "Post here")).toBe(false);
    await vi.waitFor(() => expect(hasButton(container, "Manage")).toBe(false));
  });
});

function mountController(
  api: CommunityEngagementApi,
  sessionState: () => ApplicationSessionState,
  resolveSession: () => Promise<SessionResolution>,
): CommunityEngagementController {
  let controller!: CommunityEngagementController;
  const Probe = () => {
    controller = createCommunityEngagementController({
      api,
      communityId: harbor.communityId,
      initialFollowerCount: 20,
      membershipMode: "open",
      navigate: vi.fn(),
      resolveSession,
      returnTo: `/c/${harbor.pathSegment}`,
    });
    return null;
  };
  render(() => (
    <ApplicationSessionProvider state={sessionState}>
      <Probe />
    </ApplicationSessionProvider>
  ));
  return controller;
}

describe("account-scoped counts and the session-start guard", () => {
  test("signing out restores the public follower count and signing in re-resolves personas", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account: string | null = "account-a";
    const api: CommunityEngagementApi = {
      readViewerState: vi.fn(async () => account === null
        ? { membership: "not_member" as const, following: false, followerCount: 20 }
        : { membership: "member" as const, following: true, followerCount: 41 }),
      resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
      join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona-a" })),
      follow: vi.fn(async () => ({ following: true, followerCount: 41 })),
      unfollow: vi.fn(async () => ({ following: false, followerCount: 20 })),
    };
    const resolveSession = vi.fn(async (): Promise<SessionResolution> =>
      account === null ? "anonymous" : sessionFor(account, "persona-a", harbor.communityId));

    const controller = mountController(api, sessionState, resolveSession);

    await vi.waitFor(() => expect(controller.joined()).toBe(true));
    await vi.waitFor(() => expect(controller.postingSession()).not.toBeUndefined());
    expect(controller.followerCount()).toBe(41);
    expect(controller.following()).toBe(true);
    const resolvedWhileSignedIn = resolveSession.mock.calls.length;

    account = null;
    setSessionState("anonymous");

    await vi.waitFor(() => expect(controller.joined()).toBe(false));
    // The inflated count belonged to the account's viewer read, not the page.
    expect(controller.followerCount()).toBe(20);
    expect(controller.following()).toBe(false);
    expect(controller.postingSession()).toBeUndefined();
    expect(controller.accountIdentity()).toBeNull();

    account = "account-a";
    setSessionState({ status: "authenticated", userId: "account-a" });

    // The session-start guard was cleared with the rest, so personas are read
    // again rather than the page staying permanently without them.
    await vi.waitFor(() => expect(resolveSession.mock.calls.length).toBeGreaterThan(resolvedWhileSignedIn));
    await vi.waitFor(() => expect(controller.postingSession()).not.toBeUndefined());
    await vi.waitFor(() => expect(controller.joined()).toBe(true));
  });
});
