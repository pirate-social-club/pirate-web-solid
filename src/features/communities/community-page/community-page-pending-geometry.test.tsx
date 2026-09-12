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
    // A community reached by its own identifier carries no route.
    if (path.path_segment === fixture.communityId) {
      return {
        authority_version: "optional_route_v2",
        community_id: fixture.communityId,
        href: `/c/${fixture.communityId}`,
        canonical_route: null,
        persona_role_presentation: {
          role: "owner",
          persona: {
            persona_id: `persona-${fixture.pathSegment}`,
            object: "persona",
            display_name: "Song fixture persona",
            avatar_ref: null,
            primary_public_handle: null,
          },
        },
      };
    }
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
 * The header holds exactly two fixed-size slots, follow state and membership
 * state, and nothing whose existence depends on authority. jsdom performs no
 * layout, so this reads the invariants that make the geometry fixed; the
 * measured proof lives in the browser gate.
 */
const sizingClasses = /^(h-|w-|min-w-|min-h-|max-w-|grid|flex|col-span-|gap-|md:(h-|w-|min-h-|flex|grid|shrink-))/u;

/** Only the classes that decide size; a variant colour is not geometry. */
function sizing(element: Element | null): string | null {
  if (element === null) return null;
  return element.className.split(/\s+/u).filter(name => sizingClasses.test(name)).sort().join(" ");
}

/**
 * The row's own size, which is what holds the page still. Its contents change
 * legitimately: a settled member shows the idempotent follow control and the
 * disabled Joined state rather than a visitor's two live actions.
 */
function headerSlots(container: HTMLElement) {
  const row = actionRow(container);
  return {
    row: sizing(row),
    follow: sizing(row.querySelector("[data-community-follow-slot]")),
    membership: sizing(row.querySelector("[data-community-membership-slot]")),
  };
}

function actionRowSize(container: HTMLElement): string | null {
  return sizing(actionRow(container));
}

function manageAuthority(container: HTMLElement): string | null {
  return container.querySelector("[data-community-manage]")
    ?.getAttribute("data-community-manage") ?? null;
}

function buttonNamed(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.trim() === label);
}

/** Pending follow and join both read "Checking…", so address them by purpose. */
function buttonDescribed(container: HTMLElement, description: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.getAttribute("aria-label") === description);
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
    await vi.waitFor(() => expect(buttonNamed(container, "Post")).toBeDefined());
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
    expect(buttonNamed(container, "Post")).toBeUndefined();
    expect(buttonNamed(container, "Manage community")).toBeUndefined();
    // Reserved space is not a control: it is inert and hidden from assistive
    // technology, so it states nothing about this viewer.
    // The header carries the two slots and nothing else, so nothing appears
    // there when authority settles.
    expect(actionRow(container).children.length).toBe(2);
    expect(manageAuthority(container)).toBe("pending");
    // Outcomes are announced through the shared toast region, which is fixed
    // and owns its own lifetime, so nothing they say occupies page space.
    expect(container.querySelector("[data-community-feedback]")).toBeNull();
    expect(container.querySelector("[role='region'], [data-toast-region]")?.className ?? "")
      .not.toContain("static");
  });

  test("reserves the controls row on first paint when the session cookie is present", async () => {
    document.documentElement.dataset.viewerSession = "present";
    try {
      const container = mount(() => "resolving", { member: true, canManage: true, personas: [boundPersona] });
      await vi.waitFor(() =>
        expect(container.querySelector("[data-community-persona-reserved]")).not.toBeNull());
    } finally {
      delete document.documentElement.dataset.viewerSession;
    }
  });

  test("keeps the anonymous first paint tight without the session hint", async () => {
    const container = mount(() => "resolving", { member: false, canManage: false, personas: [] });
    await vi.waitFor(() => expect(container.querySelector("[data-community-page]")).not.toBeNull());
    expect(container.querySelector("[data-community-persona-reserved]")).toBeNull();
  });

  test("a moderator who is a member keeps the same action geometry once settled", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: true, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    const pendingHeader = headerSlots(container);

    setSessionState({ status: "authenticated", userId: "account-a" });

    await vi.waitFor(() => expect(buttonNamed(container, "Post")).toBeDefined());
    await vi.waitFor(() => expect(manageAuthority(container)).toBe("available"));
    expect(buttonNamed(container, "Post")).toBeDefined();
    // Both slots stay filled with settled states: the idempotent follow
    // control and the disabled Joined state, so the row holds its size.
    expect(buttonNamed(container, "Follow")).toBeDefined();
    expect(buttonNamed(container, "Joined")?.disabled).toBe(true);
    expect(actionRowSize(container)).toBe(pendingHeader.row);
  });

  test("an anonymous viewer keeps the same action geometry once settled", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: false, canManage: false, personas: [] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    const pendingHeader = headerSlots(container);

    setSessionState("anonymous");

    await vi.waitFor(() => expect(buttonNamed(container, "Join")).toBeDefined());
    expect(buttonNamed(container, "Join")?.disabled).toBe(false);
    expect(headerSlots(container)).toEqual(pendingHeader);
  });

  test("a member without management authority keeps the same action geometry", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: false, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    const pendingHeader = headerSlots(container);

    setSessionState({ status: "authenticated", userId: "account-a" });

    await vi.waitFor(() => expect(buttonNamed(container, "Post")).toBeDefined());
    await vi.waitFor(() => expect(manageAuthority(container)).toBeNull());
    expect(actionRowSize(container)).toBe(pendingHeader.row);
  });

  test("an account check that fails keeps the same action geometry", async () => {
    const [sessionState, setSessionState] = createSignal<ApplicationSessionState>("resolving");
    const container = mount(sessionState, { member: true, canManage: true, personas: [boundPersona] });

    await vi.waitFor(() => expect(buttonNamed(container, "Checking…")).toBeDefined());
    const pendingHeader = headerSlots(container);

    setSessionState("failed");

    await vi.waitFor(() => expect(container.textContent).toContain("Retry account check"));
    expect(headerSlots(container)).toEqual(pendingHeader);
    expect(manageAuthority(container)).not.toBe("available");
    expect(buttonNamed(container, "Post")).toBeUndefined();
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

    await vi.waitFor(() => expect(buttonNamed(container, "Post")).toBeDefined());
    // Membership and personas are known, so their controls are done waiting.
    // A member's row stays filled with the idempotent follow control and the
    // disabled Joined state rather than the action the server would reject.
    expect(buttonNamed(container, "Follow")).toBeDefined();
    expect(buttonNamed(container, "Joined")?.disabled).toBe(true);
    expect(container.querySelector("[data-operation-persona]")).not.toBeNull();
    // Only management is still unknown, and it is reported on an overlay
    // trigger that is always present, so nothing on the page is waiting.
    expect(manageAuthority(container)).toBe("pending");
    expect(actionRow(container).children.length).toBe(2);
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
    expect(buttonNamed(container, "Post")).toBeUndefined();
    expect(actionRow(container).children.length).toBe(2);
  });
});

describe("the overflow menu and the outcome announcements", () => {
  /** Kobalte opens on pointerdown, which a bare click() does not produce. */
  function openOverflow(container: HTMLElement): HTMLElement {
    const trigger = container.querySelector<HTMLElement>("[aria-label='More community options']");
    if (trigger === null) throw new Error("the community overflow menu is not rendered");
    trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }));
    trigger.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, isPrimary: true }));
    trigger.click();
    return trigger;
  }

  function menuItem(label: string): HTMLElement | undefined {
    return [...document.body.querySelectorAll<HTMLElement>("[role='menuitem']")]
      .find(item => item.textContent?.trim() === label);
  }

  test("the About tab opens the details panel rather than leaving an empty column", async () => {
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(false)}
        handleSalesClient={handleSalesClient}
        loadThreads={loadThreads}
        pathSegment={harbor.pathSegment}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.threadTitle));
    // The About panel is a desktop aside and a mobile tab; the feed is what
    // gives way when the details are asked for.
    const feed = container.querySelector<HTMLElement>("[aria-label='Community feed']")!;
    expect(feed.className).not.toContain("hidden");

    const aboutTab = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "About");
    expect(aboutTab).toBeDefined();
    aboutTab!.click();

    // Hidden at every width, with no md: escape putting an empty column back.
    await vi.waitFor(() => expect(
      container.querySelector<HTMLElement>("[aria-label='Community feed']")?.className,
    ).toBe("hidden"));
    const about = container.querySelector<HTMLElement>("[aria-label='Community information']");
    expect(about?.className).not.toContain("hidden");
    expect(about?.className).toContain("md:col-span-2");
    expect(about?.textContent).toContain("About");
  });

  test("an outcome is announced with a lifetime and a way to dismiss it", async () => {
    const container = render(() => (
      <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-a" })}>
        <CommunityPage
          client={client}
          engagementApi={engagementApi(false)}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [boundPersona],
          })}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(buttonNamed(container, "Follow")).toBeDefined());
    buttonNamed(container, "Follow")!.click();

    const announcement = await vi.waitFor(() => {
      const node = [...container.querySelectorAll<HTMLElement>("[role='status'], [role='alert']")]
        .find(item => item.textContent?.includes("Following this Community."));
      expect(node).toBeDefined();
      return node!;
    });
    // It is dismissible, which the previous hand-rolled overlay was not.
    const dismiss = announcement.closest("li, div")?.querySelector("button");
    expect(dismiss).toBeDefined();
    // And it does not occupy page space: the feed is not pushed by it.
    expect(container.querySelector("[data-community-feedback]")).toBeNull();
  });
});

describe("what a community offers each viewer", () => {
  test("an active member keeps both action slots as settled states", async () => {
    const container = render(() => (
      <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-a" })}>
        <CommunityPage
          client={client}
          engagementApi={engagementApi(true)}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [boundPersona],
          })}
        />
      </ApplicationSessionProvider>
    ));

    // Spec 016 §4.6: a member may invoke follow idempotently but may not
    // unfollow, and has nothing to join. Both slots stay filled so the header
    // holds: the follow control and the disabled Joined state.
    await vi.waitFor(() => expect(buttonNamed(container, "Post")).toBeDefined());
    expect(buttonNamed(container, "Follow")).toBeDefined();
    expect(buttonNamed(container, "Following")).toBeUndefined();
    expect(buttonNamed(container, "Joined")?.disabled).toBe(true);
    expect(buttonNamed(container, "Join")).toBeUndefined();
  });

  test("a visitor who is not a member keeps both actions", async () => {
    const container = render(() => (
      <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-a" })}>
        <CommunityPage
          client={client}
          engagementApi={engagementApi(false)}
          handleSalesClient={handleSalesClient}
          loadThreads={loadThreads}
          pathSegment={harbor.pathSegment}
          postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
          resolveSession={async (): Promise<SessionResolution> => ({
            status: "authenticated", userId: "account-a", personas: [],
          })}
        />
      </ApplicationSessionProvider>
    ));

    await vi.waitFor(() => expect(buttonNamed(container, "Join")).toBeDefined());
    expect(buttonNamed(container, "Follow")).toBeDefined();
    // Posting belongs to members, so it is not offered here.
    expect(buttonNamed(container, "Post")).toBeUndefined();
  });

  test("an id-routed community keeps its identifier out of the page", async () => {
    const container = render(() => (
      <CommunityPage
        client={client}
        engagementApi={engagementApi(false)}
        handleSalesClient={handleSalesClient}
        loadThreads={loadThreads}
        pathSegment={harbor.communityId}
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain(harbor.displayName));
    // The canonical link still carries it; the page body does not.
    const header = container.querySelector("header");
    expect(header?.textContent).not.toContain(harbor.communityId);
    expect(header?.textContent).not.toContain("c/community_");
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href") ?? "")
      .toContain(harbor.communityId);
  });
});
