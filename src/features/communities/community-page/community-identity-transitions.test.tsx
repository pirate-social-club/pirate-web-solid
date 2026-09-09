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

/** Every persona name is distinct so a stale one is visible by name, not by absence. */
const personaName = (userId: string, communityId: string) =>
  `${userId} in ${fixtureFor(communityId).pathSegment}`;

const sessionFor = (userId: string, ...communityIds: readonly string[]): AuthenticatedSession => ({
  status: "authenticated",
  userId,
  personas: communityIds.map(communityId => boundPersona(
    `persona-${userId}-${fixtureFor(communityId).pathSegment}`,
    personaName(userId, communityId),
    communityId,
  )),
});

function personaControlText(container: HTMLElement): string {
  return container.querySelector("[data-operation-persona]")?.textContent ?? "";
}

function joinLabelButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button"))
    .find(button => ["Join", "Joined", "Checking…"].includes(button.textContent?.trim() ?? ""));
}

function hasButton(container: HTMLElement, label: string): boolean {
  return Array.from(container.querySelectorAll("button"))
    .some(button => button.textContent?.trim() === label);
}

/**
 * Manage lives in the banner's overflow menu, an overlay whose contents exist
 * only while it is open. The trigger reports the authority so a transition can
 * be read without driving the overlay; one focused test opens it.
 */
function manageAuthority(container: HTMLElement): string | null {
  const trigger = container.querySelector("[aria-label='More community options']");
  if (trigger === null) throw new Error("the community overflow menu is not rendered");
  return trigger.getAttribute("data-community-manage");
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
        resolveSession={async (): Promise<SessionResolution> => sessionFor("account-a", harbor.communityId, lagoon.communityId)}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.displayName));
    await vi.waitFor(() => expect(hasButton(container, "Post")).toBe(true));
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    expect(container.textContent).toContain(harbor.threadTitle);
    expect(hasButton(container, "Post")).toBe(true);
    await vi.waitFor(() => expect(personaControlText(container))
      .toContain(personaName("account-a", harbor.communityId)));

    setPathSegment(lagoon.pathSegment);

    await vi.waitFor(() => expect(container.textContent).toContain(lagoon.displayName));
    // Everything below was scoped to the community that is no longer here.
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    await vi.waitFor(() => expect(container.textContent).toContain(lagoon.threadTitle));
    expect(container.textContent).not.toContain(harbor.threadTitle);
    expect(container.textContent).not.toContain(harbor.displayName);
    expect(manageAuthority(container)).not.toBe("available");
    expect(hasButton(container, "Post")).toBe(false);
    expect(container.querySelector("[data-community-route='lagoon']")).not.toBeNull();
    expect(resolveOwnerSettingsAccess).toHaveBeenCalledWith(lagoon.communityId);
    // The account holds a persona in both communities, so the control is still
    // here: what must not survive is the persona bound to the community that
    // was here before.
    expect(personaControlText(container)).not.toContain(personaName("account-a", harbor.communityId));
    expect(container.textContent).not.toContain(personaName("account-a", harbor.communityId));
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
            account === null ? "anonymous" : sessionFor(account, harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(hasButton(container, "Post")).toBe(true));
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    await vi.waitFor(() => expect(personaControlText(container))
      .toContain(personaName("account-a", harbor.communityId)));
    expect(hasButton(container, "Post")).toBe(true);

    account = null;
    setSessionState("anonymous");

    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    expect(hasButton(container, "Post")).toBe(false);
    expect(manageAuthority(container)).not.toBe("available");
    expect(container.querySelector("[data-operation-persona]")).toBeNull();
    expect(container.textContent).not.toContain(personaName("account-a", harbor.communityId));
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
          resolveSession={async (): Promise<SessionResolution> => sessionFor(account, harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(hasButton(container, "Post")).toBe(true));
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    await vi.waitFor(() => expect(personaControlText(container))
      .toContain(personaName("account-a", harbor.communityId)));
    const viewerReadsForFirstAccount = readViewerState.mock.calls.length;

    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });

    // Account B belongs to nothing here, so the viewer state must be re-read
    // rather than carried over from the account that was signed in before.
    await vi.waitFor(() => expect(readViewerState.mock.calls.length)
      .toBeGreaterThan(viewerReadsForFirstAccount));
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    expect(hasButton(container, "Post")).toBe(false);
    await vi.waitFor(() => expect(manageAuthority(container)).not.toBe("available"));
    // Account A's persona must be gone by name, not merely superseded.
    expect(container.textContent).not.toContain(personaName("account-a", harbor.communityId));
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
      account === null ? "anonymous" : sessionFor(account, harbor.communityId));

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

/** A promise the test resolves by hand, to hold a call across a transition. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>(resolve => { settle = resolve; });
  return { promise, settle };
}

describe("actions in flight across an account change", () => {
  test("a follow issued by account A never lands on account B", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account = "account-a";
    const slowFollow = deferred<{ following: boolean; followerCount: number }>();
    const api: CommunityEngagementApi = {
      readViewerState: vi.fn(async () => ({
        membership: account === "account-a" ? "member" as const : "not_member" as const,
        following: account === "account-a",
        followerCount: 20,
      })),
      resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
      join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona-a" })),
      follow: vi.fn(() => slowFollow.promise),
      unfollow: vi.fn(() => slowFollow.promise),
    };
    const controller = mountController(api, sessionState, async () => sessionFor(account, harbor.communityId));

    await vi.waitFor(() => expect(controller.joined()).toBe(true));
    const pending = controller.followToggle();
    await vi.waitFor(() => expect(api.unfollow).toHaveBeenCalled());
    expect(controller.followBusy()).toBe(true);

    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });
    await vi.waitFor(() => expect(controller.accountIdentity()).toBe("account-b"));
    await vi.waitFor(() => expect(controller.joined()).toBe(false));
    // The busy state belonged to the account that left with it.
    expect(controller.followBusy()).toBe(false);

    slowFollow.settle({ following: true, followerCount: 99 });
    await pending;

    expect(controller.following()).toBe(false);
    expect(controller.followerCount()).toBe(20);
    expect(controller.message()).toBe("");
    expect(controller.followBusy()).toBe(false);
    expect(controller.joined()).toBe(false);
  });

  test("a join issued by account A never commits membership for account B", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account = "account-a";
    const slowJoin = deferred<{ status: "joined"; personaId: string }>();
    const api: CommunityEngagementApi = {
      readViewerState: vi.fn(async () => ({
        membership: "not_member" as const, following: false, followerCount: 20,
      })),
      resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
      join: vi.fn(() => slowJoin.promise),
      follow: vi.fn(async () => ({ following: true, followerCount: 21 })),
      unfollow: vi.fn(async () => ({ following: false, followerCount: 20 })),
    };
    const controller = mountController(api, sessionState, async () => sessionFor(account, harbor.communityId));

    await vi.waitFor(() => expect(controller.postingSession()).not.toBeUndefined());
    const pending = controller.joinCommunity();
    await vi.waitFor(() => expect(api.join).toHaveBeenCalled());

    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });
    await vi.waitFor(() => expect(controller.accountIdentity()).toBe("account-b"));

    slowJoin.settle({ status: "joined", personaId: "persona-a" });
    await pending;

    expect(controller.joined()).toBe(false);
    expect(controller.joinedPersonaId()).toBeUndefined();
    expect(controller.message()).toBe("");
    expect(controller.joinBusy()).toBe(false);
  });
});

describe("management capability across an account change", () => {
  test("a late capability answer for account A cannot restore Manage for account B", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account = "account-a";
    const { api: engagementApi } = accountScopedEngagementApi(
      new Map([["account-a", new Set([harbor.communityId])]]),
      () => account,
    );
    const slowOwnerAccess = deferred<boolean>();
    const resolveOwnerSettingsAccess = vi.fn(async () => account === "account-a"
      ? slowOwnerAccess.promise
      : false);

    const container = render(() => (
      <ApplicationSessionProvider state={sessionState}>
        <CommunityPage
          client={routeClient}
          engagementApi={engagementApi}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveOwnerSettingsAccess={resolveOwnerSettingsAccess}
          resolveSession={async (): Promise<SessionResolution> => sessionFor(account, harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(resolveOwnerSettingsAccess).toHaveBeenCalled());
    const requestsForFirstAccount = resolveOwnerSettingsAccess.mock.calls.length;

    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });

    await vi.waitFor(() => expect(resolveOwnerSettingsAccess.mock.calls.length)
      .toBeGreaterThan(requestsForFirstAccount));
    await vi.waitFor(() => expect(manageAuthority(container)).not.toBe("available"));

    // Account A's answer arrives last and grants authority. It is retired.
    slowOwnerAccess.settle(true);
    await vi.waitFor(() => expect(manageAuthority(container)).not.toBe("available"));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(manageAuthority(container)).not.toBe("available");
  });

  test("an unresolved identity costs no capability request", async () => {
    const resolveOwnerSettingsAccess = vi.fn(async () => true);
    const { api: engagementApi } = accountScopedEngagementApi(new Map(), () => null);
    render(() => (
      <CommunityPage
        client={routeClient}
        engagementApi={engagementApi}
        handleSalesClient={handleSalesClient}
        loadThreads={loadThreads}
        pathSegment={harbor.pathSegment}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        resolveOwnerSettingsAccess={resolveOwnerSettingsAccess}
      />
    ));

    // No provider and no session resolver: the account is never established,
    // so there is no identity a capability could belong to.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(resolveOwnerSettingsAccess).not.toHaveBeenCalled();
  });
});

describe("an account check that fails", () => {
  test("failure drops account-scoped state and a later success restores it", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let failing = false;
    const { api: engagementApi } = accountScopedEngagementApi(
      new Map([["account-a", new Set([harbor.communityId])]]),
      () => failing ? null : "account-a",
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
          resolveOwnerSettingsAccess={async () => !failing}
          resolveSession={async (): Promise<SessionResolution> =>
            failing ? "anonymous" : sessionFor("account-a", harbor.communityId)}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(hasButton(container, "Post")).toBe(true));
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    await vi.waitFor(() => expect(personaControlText(container))
      .toContain(personaName("account-a", harbor.communityId)));

    failing = true;
    setSessionState("failed");

    // A failed check is an identity loss, not a banner over stale state.
    await vi.waitFor(() => expect(joinLabelButton(container)?.textContent?.trim()).toBe("Join"));
    expect(hasButton(container, "Post")).toBe(false);
    await vi.waitFor(() => expect(manageAuthority(container)).not.toBe("available"));
    expect(container.querySelector("[data-operation-persona]")).toBeNull();
    expect(container.textContent).not.toContain(personaName("account-a", harbor.communityId));
    expect(container.textContent).toContain("Retry account check");

    failing = false;
    setSessionState({ status: "authenticated", userId: "account-a" });

    await vi.waitFor(() => expect(hasButton(container, "Post")).toBe(true));
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    await vi.waitFor(() => expect(personaControlText(container))
      .toContain(personaName("account-a", harbor.communityId)));
    expect(hasButton(container, "Post")).toBe(true);
  });
});

describe("persona retry ownership across an account change", () => {
  test("a retry settling for account A does not release account B's retry", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>(
      { status: "authenticated", userId: "account-a" },
    );
    let account = "account-a";
    const pendingResolutions: Array<{ settle: (value: SessionResolution) => void }> = [];
    const resolveSession = vi.fn((): Promise<SessionResolution> => {
      const next = deferred<SessionResolution>();
      pendingResolutions.push(next);
      return next.promise;
    });
    /** Authenticated, but the persona read failed, which is what retry is for. */
    const personasUnavailable = (userId: string): SessionResolution => ({
      status: "authenticated", userId, personas: [], personasUnavailable: true,
    });
    const { api } = accountScopedEngagementApi(new Map(), () => account);

    const controller = mountController(api, sessionState, resolveSession);

    // 1. Account A resolves without personas, then starts a retry.
    await vi.waitFor(() => expect(pendingResolutions.length).toBe(1));
    pendingResolutions[0].settle(personasUnavailable("account-a"));
    await vi.waitFor(() => expect(controller.personaRetryAvailable()).toBe(true));

    const retryForA = controller.retryPersonas();
    await vi.waitFor(() => expect(pendingResolutions.length).toBe(2));
    expect(controller.personaRetryBusy()).toBe(true);

    // 2. The identity changes while account A's retry is still in flight.
    account = "account-b";
    setSessionState({ status: "authenticated", userId: "account-b" });
    await vi.waitFor(() => expect(controller.accountIdentity()).toBe("account-b"));
    expect(controller.personaRetryBusy()).toBe(false);

    // 3. Account B resolves without personas and starts its own retry.
    await vi.waitFor(() => expect(pendingResolutions.length).toBe(3));
    pendingResolutions[2].settle(personasUnavailable("account-b"));
    await vi.waitFor(() => expect(controller.personaRetryAvailable()).toBe(true));

    const retryForB = controller.retryPersonas();
    await vi.waitFor(() => expect(pendingResolutions.length).toBe(4));
    expect(controller.personaRetryBusy()).toBe(true);

    // 4. Account A's retry settles last. It owns nothing here any more.
    pendingResolutions[1].settle(personasUnavailable("account-a"));
    await retryForA;
    expect(controller.personaRetryBusy()).toBe(true);

    // 5. A third attempt stays coalesced behind account B's pending retry.
    const attemptsWhileBPending = resolveSession.mock.calls.length;
    // Not awaited: a coalesced attempt returns at once, while an attempt that
    // wrongly got through would await a resolution nothing settles.
    void controller.retryPersonas();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(resolveSession.mock.calls.length).toBe(attemptsWhileBPending);
    expect(controller.personaRetryBusy()).toBe(true);

    // Account B's own retry releases the flag, and a later attempt proceeds.
    // It settles unavailable again so the retry affordance is still there.
    pendingResolutions[3].settle(personasUnavailable("account-b"));
    await retryForB;
    await vi.waitFor(() => expect(controller.personaRetryBusy()).toBe(false));
    void controller.retryPersonas();
    await vi.waitFor(() => expect(resolveSession.mock.calls.length)
      .toBeGreaterThan(attemptsWhileBPending));
  });
});
