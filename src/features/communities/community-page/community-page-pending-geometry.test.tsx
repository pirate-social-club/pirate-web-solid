import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SessionResolution } from "../../../api/session.ts";
import { createMemoryMediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
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

const client = {
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

function engagementApi(member: boolean): CommunityEngagementApi {
  return {
    readViewerState: vi.fn(async () => ({
      membership: member ? "member" as const : "not_member" as const,
      following: false,
      followerCount: 20,
    })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona-one" })),
    follow: vi.fn(async () => ({ following: true, followerCount: 21 })),
    unfollow: vi.fn(async () => ({ following: false, followerCount: 20 })),
  };
}

const boundPersona = {
  personaId: "persona-one",
  displayName: "Harbor voice",
  avatarRef: null,
  primaryPublicHandle: null,
  communityBinding: { communityId: harbor.communityId, bindingSource: "first_membership" as const },
};

function actionRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>("[aria-label='Community actions']");
  if (row === null) throw new Error("the community action row is not rendered");
  return row;
}

/**
 * The reserved regions and the height they hold. jsdom performs no layout, so
 * this reads the reservation itself: the action row, the persona row and the
 * feedback region each keep their reserved height class in every state, which
 * is what stops a control appearing or disappearing from moving the page.
 */
function reservedGeometry(container: HTMLElement) {
  const row = actionRow(container);
  return {
    actions: row.getAttribute("data-community-actions-reserved") !== null
      && row.className.includes("min-h-[9.5rem]"),
    persona: container.querySelector("[data-community-persona-reserved]")?.className.includes("h-9") === true,
    feedback: container.querySelector("[data-community-feedback]")?.className.includes("min-h-14") === true,
  };
}

const reserved = { actions: true, persona: true, feedback: true };

function buttonNamed(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.trim() === label);
}

/** Pending follow and join both read "Checking…", so address them by purpose. */
function buttonDescribed(container: HTMLElement, description: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.getAttribute("aria-label") === description);
}

function pendingControls(container: HTMLElement): number {
  return container.querySelectorAll("[data-pending-control]").length;
}

describe("the feed a host supplies", () => {
  test("injected posts render with no pending state and no read", async () => {
    const load = vi.fn(loadThreads);
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(false)}
        handleSalesClient={handleSalesClient}
        loadThreads={load}
        pathSegment={harbor.pathSegment}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        surfaceData={{ posts: [{
          id: "injected", title: "Injected thread", body: "Supplied by the host.",
          score: 1, publishedAt: "2026-09-01T18:00:00.000Z", commentCount: 0,
        }] }}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Injected thread"));
    expect(container.textContent).not.toContain("Loading community posts");
    expect(load).not.toHaveBeenCalled();
  });

  test("one mount reads the feed once", async () => {
    const load = vi.fn(loadThreads);
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(true)}
        handleSalesClient={handleSalesClient}
        loadThreads={load}
        pathSegment={harbor.pathSegment}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        resolveSession={async (): Promise<SessionResolution> => ({
          status: "authenticated", userId: "account-a", personas: [boundPersona],
        })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.threadTitle));
    // Membership, personas and management authority all settle after the feed.
    // None of them may cause the public feed to be read again.
    await vi.waitFor(() => expect(buttonNamed(container, "Joined")).toBeDefined());
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("a failed read states the failure instead of an empty feed", async () => {
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(false)}
        handleSalesClient={handleSalesClient}
        loadThreads={async () => { throw new Error("thread read failed"); }}
        pathSegment={harbor.pathSegment}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent)
      .toContain("Community posts are temporarily unavailable"));
    expect(container.textContent).not.toContain("No posts in this community yet");
  });

  test("a move to another community loads that community's feed", async () => {
    const [pathSegment, setPathSegment] = createSignal(harbor.pathSegment);
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(false)}
        handleSalesClient={handleSalesClient}
        loadThreads={loadThreads}
        pathSegment={pathSegment()}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.threadTitle));
    setPathSegment(lagoon.pathSegment);
    await vi.waitFor(() => expect(container.textContent).toContain(lagoon.threadTitle));
    expect(container.textContent).not.toContain(harbor.threadTitle);
  });
});

describe("private controls while authority settles", () => {
  function mount(
    sessionState: () => ApplicationSessionState,
    options: { member: boolean; canManage: boolean; personas: readonly typeof boundPersona[] },
  ) {
    return render(() => (
      <ApplicationSessionProvider state={sessionState}>
        <CommunityPage
          client={client}
          engagementApi={engagementApi(options.member)}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveOwnerSettingsAccess={async () => options.canManage}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [...options.personas],
          })}
        />
      </ApplicationSessionProvider>
    ));
  }

  test("a pending viewer is offered nothing to act on and told nothing untrue", async () => {
    const container = mount(() => "resolving", { member: true, canManage: true, personas: [boundPersona] });

    await vi.waitFor(() => expect(container.querySelector("[aria-label='Community actions']")).not.toBeNull());
    expect(buttonDescribed(container, "Checking your membership")?.disabled).toBe(true);
    expect(buttonDescribed(container, "Checking your follow state")?.disabled).toBe(true);
    // Follow, Following, Join and Joined each state something unread.
    expect(buttonNamed(container, "Follow")).toBeUndefined();
    expect(buttonNamed(container, "Following")).toBeUndefined();
    expect(buttonNamed(container, "Join")).toBeUndefined();
    expect(buttonNamed(container, "Joined")).toBeUndefined();
    expect(buttonNamed(container, "Post here")).toBeUndefined();
    expect(buttonNamed(container, "Manage")).toBeUndefined();
    // Reserved space is not a control: it is inert and hidden from assistive
    // technology, so it states nothing about this viewer.
    expect(pendingControls(container)).toBe(3);
    expect(reservedGeometry(container)).toEqual(reserved);
    for (const reserved of container.querySelectorAll("[data-pending-control]")) {
      expect(reserved.getAttribute("aria-hidden")).toBe("true");
      expect(reserved.querySelector("button")).toBeNull();
    }
    expect(container.querySelector("[data-community-feedback]")).not.toBeNull();
  });

  test("a moderator who is a member keeps the same action geometry once settled", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: true, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    expect(reservedGeometry(container)).toEqual(reserved);

    setSessionState({ status: "authenticated", userId: "account-a" });

    await vi.waitFor(() => expect(buttonNamed(container, "Joined")).toBeDefined());
    await vi.waitFor(() => expect(buttonNamed(container, "Manage")).toBeDefined());
    expect(buttonNamed(container, "Post here")).toBeDefined();
    expect(reservedGeometry(container)).toEqual(reserved);
    expect(pendingControls(container)).toBe(0);
    expect(container.querySelector("[data-community-feedback]")).not.toBeNull();
  });

  test("an anonymous viewer keeps the same action geometry once settled", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: false, canManage: false, personas: [] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    expect(reservedGeometry(container)).toEqual(reserved);

    setSessionState("anonymous");

    await vi.waitFor(() => expect(buttonNamed(container, "Join")).toBeDefined());
    expect(buttonNamed(container, "Join")?.disabled).toBe(false);
    expect(reservedGeometry(container)).toEqual(reserved);
    expect(pendingControls(container)).toBe(0);
  });

  test("a member without management authority keeps the same action geometry", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: false, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    expect(reservedGeometry(container)).toEqual(reserved);

    setSessionState({ status: "authenticated", userId: "account-a" });

    await vi.waitFor(() => expect(buttonNamed(container, "Joined")).toBeDefined());
    await vi.waitFor(() => expect(pendingControls(container)).toBe(0));
    expect(buttonNamed(container, "Manage")).toBeUndefined();
    expect(reservedGeometry(container)).toEqual(reserved);
  });

  test("an account check that fails keeps the same action geometry", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: true, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    expect(reservedGeometry(container)).toEqual(reserved);

    setSessionState("failed");

    await vi.waitFor(() => expect(container.textContent).toContain("Retry account check"));
    expect(reservedGeometry(container)).toEqual(reserved);
    expect(buttonNamed(container, "Manage")).toBeUndefined();
    expect(buttonNamed(container, "Post here")).toBeUndefined();
  });
});

describe("management authority settles on its own schedule", () => {
  test("a moderation read that never answers holds nothing but Manage", async () => {
    const container = render(() => (
      <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-a" })}>
        <CommunityPage
          client={client}
          engagementApi={engagementApi(true)}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          // Never answers. Management authority stays unknown for the life of
          // the page while everything else is long since known.
          resolveOwnerSettingsAccess={() => new Promise<boolean>(() => {})}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [boundPersona],
          })}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(buttonNamed(container, "Joined")).toBeDefined());
    // Membership and personas are known, so their controls are done waiting.
    expect(buttonNamed(container, "Post here")).toBeDefined();
    expect(buttonNamed(container, "Follow")?.disabled).toBe(false);
    expect(container.querySelector("[data-operation-persona]")).not.toBeNull();
    // Only the management slot is still reserved.
    expect(buttonNamed(container, "Manage")).toBeUndefined();
    expect(pendingControls(container)).toBe(1);
    expect(reservedGeometry(container)).toEqual(reserved);
  });
});

describe("a membership read that fails", () => {
  test("the controls ask to check rather than stating a membership", async () => {
    const failingApi: CommunityEngagementApi = {
      ...engagementApi(false),
      readViewerState: vi.fn(async () => { throw new Error("viewer read failed"); }),
    };
    const container = render(() => (
      <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-a" })}>
        <CommunityPage
          client={client}
          engagementApi={failingApi}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveOwnerSettingsAccess={async () => false}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [boundPersona],
          })}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(buttonNamed(container, "Check membership")).toBeDefined());
    // Actionable, because retrying an action is how this recovers.
    expect(buttonNamed(container, "Check membership")?.disabled).toBe(false);
    expect(buttonNamed(container, "Check follow")?.disabled).toBe(false);
    // None of these may be stated from a read that failed.
    expect(buttonNamed(container, "Join")).toBeUndefined();
    expect(buttonNamed(container, "Joined")).toBeUndefined();
    expect(buttonNamed(container, "Follow")).toBeUndefined();
    expect(buttonNamed(container, "Following")).toBeUndefined();
    expect(buttonNamed(container, "Post here")).toBeUndefined();
    expect(reservedGeometry(container)).toEqual(reserved);
  });
});
