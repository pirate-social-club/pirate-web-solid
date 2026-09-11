import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
  GetPostsPostIdResponse,
} from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import { createMemoryMediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import CommunityPage from "./community-page.tsx";

const disposers: Array<() => void> = [];

/**
 * The viewer's vote comes from the authenticated post read, so a page under
 * test needs one. Without it the controls correctly wait forever rather than
 * claiming the viewer has not voted.
 */
function viewerVoteClient(vote: -1 | 1 | null) {
  const response: Exclude<GetPostsPostIdResponse, { kind: "age_locked" }> = JSON.parse(JSON.stringify({
    post: {
      id: "post-under-test",
      object: "post",
      community: communityId,
      authorship_mode: "human_direct",
      identity_mode: "public",
      post_type: "text",
      status: "published",
      visibility: "public",
      analysis_state: "allow",
      content_safety_state: "safe",
      age_gate_policy: "none",
      created: 1_756_752_000,
    },
    thread_snapshot: null,
    upvote_count: 0,
    downvote_count: 0,
    like_count: 0,
    viewer_vote: vote,
    viewer_reaction_kinds: [],
    resolved_locale: "en",
    translation_state: "ready",
    machine_translated: false,
    source_hash: null,
  }));
  return { get_postsPostId: async (input: { path: { postId: string } }) => ({ ...response, post: { ...response.post, id: input.path.postId } }) };
}

/** The contextual composer is open when its one close control exists and no
 * raw community identifier input is offered. */
function contextualComposerOpen(): boolean {
  return document.body.querySelector("button[aria-label='Close composer']") !== null
    && document.body.querySelector("input[name='community-id']") === null;
}


const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const route: GetCPathSegmentResponse = {
  community_id: communityId,
  canonical_route: {
    family: "hns",
    root_label: "xn--pokmon-dva",
    root_label_display: "pokémon",
    path_segment: "xn--pokmon-dva",
    href: "/c/xn--pokmon-dva",
    app_host: "app.xn--pokmon-dva",
  },
};
const preview: GetCommunitiesCommunityIdPreviewResponse = {
  id: communityId,
  object: "community_preview",
  display_name: "Pirate Harbor",
  description: "Public conversations.",
  membership_mode: "open",
  human_verification_lane: null,
  member_count: 12,
  follower_count: 20,
  moderators: [],
  membership_gate_summaries: [],
  rules: [{ id: "rule-1", object: "community_rule", title: "Respect", body: "Be kind.", report_reason: "abuse", position: 1, status: "active" }],
  created: 1_700_000_000,
};

function engagementApi(overrides: Partial<CommunityEngagementApi> = {}): CommunityEngagementApi {
  let committed = false;
  return {
    readViewerState: vi.fn(async () => ({ membership: committed ? "member" as const : "not_member" as const, following: committed, followerCount: committed ? 21 : 20 })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => { committed = true; return { status: "joined" as const, personaId: "persona_1" }; }),
    follow: vi.fn(async () => ({ following: true, followerCount: 21 })),
    unfollow: vi.fn(async () => ({ following: false, followerCount: 20 })),
    ...overrides,
  };
}

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

/** Kobalte opens on pointerdown, which a bare click() does not produce. */
function openOverlay(trigger: HTMLElement): void {
  trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }));
  trigger.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, isPrimary: true }));
  trigger.click();
}

function activateOverlayItem(item: HTMLElement): void {
  item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }));
  item.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, isPrimary: true }));
  item.click();
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("CommunityPage", () => {
  test("loads real Community threads into the Reddit-style feed", async () => {
    const loadThreads = vi.fn(async () => ({
      posts: [{
        id: "thread-1",
        title: "Welcome aboard",
        body: "This came from the public Community feed.",
        score: 7,
        publishedAt: "2026-09-01T18:00:00.000Z",
        authorHandle: "captain-one.pirate",
        commentCount: 4,
      }],
      nextCursor: null,
    }));
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        loadThreads={loadThreads}
        pathSegment="xn--pokmon-dva"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Welcome aboard"));
    expect(container.textContent).toContain("This came from the public Community feed.");
    expect(container.querySelector("[data-community-post='thread-1']")).not.toBeNull();
    expect(loadThreads).toHaveBeenCalledWith(communityId);

    // No session was resolved, so nothing here can act. The counts are shown,
    // and no control is offered that has no handler behind it.
    const counts = container.querySelector("[data-post-counts]");
    expect(counts).not.toBeNull();
    expect(counts?.textContent).toContain("7");
    expect(counts?.textContent).toContain("4");
    expect(counts?.querySelector("button")).toBeNull();
    expect(container.querySelector("[aria-label='Post actions'] button")).toBeNull();
  });

  test("shows the viewer's existing vote as selected rather than as no vote", async () => {
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi()}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        loadThreads={async () => ({
          posts: [{
            id: "thread-voted",
            title: "Already voted",
            body: "The viewer upvoted this before the page was opened.",
            score: 4,
            upvoteCount: 5,
            downvoteCount: 1,
            publishedAt: "2026-09-01T18:00:00.000Z",
            commentCount: 0,
          }],
          nextCursor: null,
        })}
        pathSegment="xn--pokmon-dva"
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        viewerVoteClient={viewerVoteClient(1)}
        resolveSession={async () => ({
          status: "authenticated",
          userId: "usr-account-one",
          personas: [],
        })}
      />
    ));

    // The public thread response cannot carry this, so it comes from the
    // authenticated post read. Before that read existed the control opened
    // unselected and a second press would have toggled from the wrong state.
    await vi.waitFor(() => expect(container.querySelector("button[aria-label='Upvote']")).not.toBeNull());
    expect(container.querySelector("button[aria-label='Upvote']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("button[aria-label='Downvote']")?.getAttribute("aria-pressed")).toBe("false");
  });

  test("keeps failed vote reads unavailable until retry recovers the existing vote", async () => {
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi()}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        loadThreads={async () => ({
          posts: [{
            id: "thread-voted",
            title: "Already voted",
            body: "The viewer upvoted this before the page was opened.",
            score: 4,
            upvoteCount: 5,
            downvoteCount: 1,
            publishedAt: "2026-09-01T18:00:00.000Z",
            commentCount: 0,
          }],
          nextCursor: null,
        })}
        pathSegment="xn--pokmon-dva"
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        viewerVoteClient={{ get_postsPostId: vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(viewerVoteClient(1).get_postsPostId) }}
        resolveSession={async () => ({
          status: "authenticated",
          userId: "usr-account-one",
          personas: [],
        })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Your vote could not be checked"));
    expect(container.querySelector("button[aria-label='Upvote']")).toBeNull();
    const retry = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Retry vote");
    expect(retry).toBeDefined();
    retry?.click();
    await vi.waitFor(() => expect(container.querySelector("button[aria-label='Upvote']")?.getAttribute("aria-pressed")).toBe("true"));
  });

  test("offers engagement without a persona and asks for one only to author", async () => {
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi()}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        loadThreads={async () => ({
          posts: [{
            id: "thread-persona",
            title: "Choose your voice",
            body: "Persona selection owns comment authorship.",
            score: 2,
            publishedAt: "2026-09-01T18:00:00.000Z",
            commentCount: 4,
          }],
          nextCursor: null,
        })}
        pathSegment="xn--pokmon-dva"
        postComposerMediaStorage={createMemoryMediaSubmissionStorage()}
        viewerVoteClient={viewerVoteClient(null)}
        resolveSession={async () => ({
          status: "authenticated",
          userId: "usr-account-one",
          personas: [
            { personaId: "persona-one", displayName: "Persona One", avatarRef: null, primaryPublicHandle: "one.pirate", communityBinding: { communityId, bindingSource: "first_membership" } },
            { personaId: "persona-two", displayName: "Persona Two", avatarRef: null, primaryPublicHandle: "two.pirate", communityBinding: { communityId, bindingSource: "first_membership" } },
          ],
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-operation-persona]")).not.toBeNull());

    // No persona is selected yet. Voting is account-scoped, so the real
    // controls mount now rather than leaving the handlerless placeholders up.
    await vi.waitFor(() => expect(container.querySelector("button[aria-label='Comments (4)']")).not.toBeNull());
    expect(container.querySelector("button[aria-label='Open 4 comments']")).toBeNull();

    // Authorship is what needs a profile, and the composer says so before the
    // viewer types rather than refusing after they have written something.
    container.querySelector<HTMLButtonElement>("button[aria-label='Comments (4)']")!.click();
    await vi.waitFor(() => expect(document.body.querySelector("textarea[aria-label='Write a comment']")).not.toBeNull());
    expect(document.body.querySelector<HTMLTextAreaElement>("textarea[aria-label='Write a comment']")!.disabled).toBe(true);
    expect(document.body.textContent).toContain("Choose a profile to comment as.");

    container.querySelector<HTMLButtonElement>("[data-operation-persona] button")!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Persona Two"));
    const personaTwo = document.body.querySelector<HTMLInputElement>("input[value='persona-two']");
    expect(personaTwo).not.toBeNull();
    personaTwo!.click();

    await vi.waitFor(() => expect(
      document.body.querySelector<HTMLTextAreaElement>("textarea[aria-label='Write a comment']")!.disabled,
    ).toBe(false));
  });

  test("renders the public community projection and canonical metadata", async () => {
    const container = render(() => <CommunityPage pathSegment="xn--pokmon-dva" client={{
      get_cPathSegment: async () => route,
      get_communitiesCommunityIdPreview: async () => preview,
    }} handleSalesClient={{
      get_communitiesCommunityIdHandleOfferings: async () => ({
        items: [{
          offering_id: "offering-public-1",
          offering_revision: 1,
          offering_hash: "offering-hash",
          community_id: communityId,
          family: "hns",
          namespace_root: "xn--pokmon-dva",
          display_root: "pokémon",
          sale_namespace_activation_id: "activation-1",
          sale_namespace_activation_generation: 1,
          label_scope: {
            kind: "label_rule_v2",
            label_grammar_id: "hns_ascii_ldh_1_63_v1",
            reserved_labels_id: "reserved-1",
            reserved_labels_revision: 1,
            reserved_labels_hash: "reserved-hash",
            availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
          },
          allocation: { kind: "first_come_v1" },
          max_active_grants_per_account: 1,
          fulfillment: { kind: "hosted_persona_v1" },
          qualification_policy: { kind: "none_v1", policy_id: "policy-1", policy_revision: 1, policy_hash: "policy-hash" },
          pricing: { kind: "free_v1", pricing_id: "free-1", pricing_revision: 1, pricing_hash: "pricing-hash", atomic_amount: "0" },
          issuance: { family: "hns", driver_id: "hosted-persona-local", driver_version: "1" },
          quote_ttl_seconds: 120,
          reservation_ttl_seconds: 300,
          status: "active",
          created_at: "2026-08-26T12:00:00.000Z",
        }],
        next_cursor: null,
      }),
    }} />);
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    expect(container.getAttribute("data-community-state")).toBeNull();
    expect(container.querySelector("[data-community-state='success']")).not.toBeNull();
    expect(container.querySelector("[data-community-page]")).not.toBeNull();
    expect(container.textContent).toContain("Public conversations.");
    expect(container.textContent).toContain("Respect");
    expect(container.textContent).toContain("Feed");
    expect(container.textContent).toContain("About Pirate Harbor");
    await vi.waitFor(() => expect(container.querySelector("[data-community-names-cta]")).not.toBeNull());
    expect(container.querySelector<HTMLAnchorElement>("[data-community-names-cta]")?.href)
      .toContain(`/c/${communityId}/names`);
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href"))
      .toContain("/c/xn--pokmon-dva");
  });

  test("opens an authenticated composer scoped to the resolved community", async () => {
    const resolveSession = vi.fn(async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
    }));
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi({
          readViewerState: vi.fn(async () => ({ membership: "member" as const, following: false, followerCount: 20 })),
        })}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={resolveSession}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledTimes(1));

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post")!;
    postHere.click();

    expect(resolveSession).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
  });

  test("profile failure does not open an empty composer and the Post action retries", async () => {
    let unavailable = true;
    const resolveSession = vi.fn(async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
      personasUnavailable: unavailable ? true as const : undefined,
    }));
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi({
          readViewerState: vi.fn(async () => ({ membership: "member" as const, following: false, followerCount: 20 })),
        })}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={resolveSession}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledTimes(1));

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post")!;
    postHere.click();

    await vi.waitFor(() => expect(container.textContent).toContain("couldn't load your active personas"));
    expect(contextualComposerOpen()).toBe(false);
    expect(document.body.textContent).not.toContain("Create or reactivate a public persona");
    unavailable = false;
    postHere.click();
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
    // The profile failure is over, which shows in the control it governs
    // rather than in an announcement that has its own lifetime.
    expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.trim() === "Retry profiles")).toBe(false);
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(contextualComposerOpen()).toBe(true);
  });

  test("visible profile retry restores community controls without opening a composer", async () => {
    let unavailable = true;
    const resolveSession = vi.fn(async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
      personasUnavailable: unavailable ? true as const : undefined,
    }));
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi({
          readViewerState: vi.fn(async () => ({ membership: "member" as const, following: false, followerCount: 20 })),
        })}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={resolveSession}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledTimes(1));

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post")!;

    await vi.waitFor(() => expect(container.textContent).toContain("couldn't load your active personas"));
    expect(contextualComposerOpen()).toBe(false);
    expect(document.body.textContent).not.toContain("Create or reactivate a public persona");
    // This viewer is a member, so Spec 016 leaves them no follow to exercise
    // here; the controller suite covers a follow succeeding while profiles are
    // unavailable. What matters on the page is that the retry is offered.
    expect([...container.querySelectorAll("button")].some(button => button.textContent?.trim() === "Retry profiles")).toBe(true);
    unavailable = false;
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Retry profiles")!.click();
    await vi.waitFor(() => expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.trim() === "Retry profiles")).toBe(false));
    expect(contextualComposerOpen()).toBe(false);
    postHere.click();
    // Recovery is complete when the composer opens and the control that
    // governed the failure is gone. Whether an earlier announcement is still
    // on screen is the toast region's business, not this page's state.
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
    expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.trim() === "Retry profiles")).toBe(false);
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(contextualComposerOpen()).toBe(true);
  });

  test("fails closed when routed membership disappears before posting", async () => {
    const readViewerState = vi
      .fn()
      .mockResolvedValueOnce({ membership: "member" as const, following: false, followerCount: 20 })
      .mockResolvedValueOnce({
        membership: "not_member" as const,
        following: false,
        followerCount: 20,
      });
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={engagementApi({ readViewerState })}
        handleSalesClient={{
          get_communitiesCommunityIdHandleOfferings: async () => ({
            items: [],
            next_cursor: null,
          }),
        }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({
          status: "authenticated",
          userId: "account-one",
          personas: [],
        })}
      />
    ));

    await vi.waitFor(() => expect(readViewerState).toHaveBeenCalledTimes(1));
    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Post",
    );
    expect(postHere).toBeDefined();
    postHere!.click();

    await vi.waitFor(() => expect(readViewerState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(container.textContent).toContain("Join this Community before posting."));
    expect(contextualComposerOpen()).toBe(false);
  });

  test("joins an open Community only after the server confirms membership", async () => {
    const api = engagementApi();
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [{
          personaId: "persona_1", displayName: "Member", avatarRef: null, primaryPublicHandle: null, communityBinding: null,
        }] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalledWith(communityId));
    const join = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Join")!;
    join.click();
    await vi.waitFor(() => expect(api.join).toHaveBeenCalledWith(communityId, { kind: "existing", personaId: "persona_1" }));
    await vi.waitFor(() => expect(container.textContent).toContain("Joined this Community."));
    // Spec 016 leaves a member neither Join nor Follow, so the proof of
    // membership is the action they gained, not a label on the one they lost.
    await vi.waitFor(() => expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.trim() === "Post")).toBe(true));
    expect([...container.querySelectorAll("button")]
      .some(button => ["Join", "Joined", "Follow", "Following"].includes(button.textContent?.trim() ?? ""))).toBe(false);
  });

  test("shows a requested membership as pending instead of joined", async () => {
    const api = engagementApi({
      resolveJoinAction: vi.fn(async () => ({ kind: "request" as const })),
      join: vi.fn(async () => ({ status: "requested" as const, personaId: null })),
    });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => ({ ...preview, membership_mode: "request" }) }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
    const request = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Request to join")!;
    request.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Membership request sent."));
    expect(request.textContent).toBe("Request pending");
    expect(request.disabled).toBe(true);
  });

  test("initializes an existing member from the authenticated preview", async () => {
    const api = engagementApi({
      readViewerState: vi.fn(async () => ({ membership: "member" as const, following: true, followerCount: 21 })),
    });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("21 followers"));
    // An existing member is offered neither action and keeps the one that is
    // theirs; the server would answer a member's unfollow with a conflict.
    expect([...container.querySelectorAll("button")]
      .some(button => ["Join", "Joined", "Follow", "Following"].includes(button.textContent?.trim() ?? ""))).toBe(false);
    expect(container.textContent).toContain("Post");
    expect(api.resolveJoinAction).not.toHaveBeenCalled();
  });

  test("hands a Very-gated join to the existing verification route", async () => {
    const navigate = vi.fn();
    const api = engagementApi({
      resolveJoinAction: vi.fn(async () => ({ kind: "verify" as const, providerId: "very.web", intentId: "server-intent-1" })),
    });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => ({ ...preview, membership_mode: "gated", human_verification_lane: "very" }) }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        navigate={navigate}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Verify to join")!
      .click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(
      `/verify/very?community_id=${encodeURIComponent(communityId)}&return_to=%2Fc%2Fxn--pokmon-dva`,
    ));
    expect(api.join).not.toHaveBeenCalled();
  });

  test("follows and unfollows using the server-returned follower count", async () => {
    const api = engagementApi();
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
    const follow = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Follow")!;
    follow.click();
    await vi.waitFor(() => expect(follow.textContent).toBe("Following"));
    expect(container.textContent).toContain("21 followers");
    follow.click();
    await vi.waitFor(() => expect(follow.textContent).toBe("Follow"));
    expect(container.textContent).toContain("20 followers");
  });

  test("coalesces rapid follow clicks into one server write", async () => {
    let settleFollow!: (value: { following: true; followerCount: number }) => void;
    const pendingFollow = new Promise<{ following: true; followerCount: number }>(resolve => { settleFollow = resolve; });
    const followWrite = vi.fn(() => pendingFollow);
    const api = engagementApi({ follow: followWrite });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
    const follow = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Follow")!;
    follow.click();
    follow.click();
    await vi.waitFor(() => expect(followWrite).toHaveBeenCalledTimes(1));
    settleFollow({ following: true, followerCount: 21 });
    await vi.waitFor(() => expect(follow.textContent).toBe("Following"));
  });

  test("keeps engagement state unchanged when a server write fails", async () => {
    const api = engagementApi({ follow: vi.fn(async () => { throw new Error("private failure"); }) });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
    const follow = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Follow")!;
    follow.click();
    await vi.waitFor(() => expect(container.textContent).toContain("We couldn't update your follow. Nothing changed."));
    expect(follow.textContent).toBe("Follow");
    expect(container.textContent).not.toContain("private failure");
  });

  test("sends anonymous follow intent to the app-owned sign-in ceremony without writing", async () => {
    const signInRequested = vi.fn();
    window.addEventListener("pirate:connect", signInRequested);
    const api = engagementApi();
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => "anonymous"}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Follow")!
      .click();
    await vi.waitFor(() => expect(signInRequested).toHaveBeenCalledTimes(1));
    expect(api.follow).not.toHaveBeenCalled();
    expect(api.unfollow).not.toHaveBeenCalled();
    window.removeEventListener("pirate:connect", signInRequested);
  });

  test("does not guess follow direction when authenticated viewer state is unavailable", async () => {
    const readViewerState = vi.fn(async () => { throw new Error("private read failure"); });
    const api = engagementApi({ readViewerState });
    const container = render(() => (
      <CommunityPage
        client={{ get_cPathSegment: async () => route, get_communitiesCommunityIdPreview: async () => preview }}
        engagementApi={api}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Retry an action to check again."));
    // The read failed, so the control asks to check rather than offering to
    // follow, which would state a direction nothing established.
    expect(container.textContent).not.toContain(">Follow<");
    const recheck = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Check follow")!;
    expect(recheck.disabled).toBe(false);
    recheck.click();
    await vi.waitFor(() => expect(readViewerState).toHaveBeenCalledTimes(2));
    expect(api.follow).not.toHaveBeenCalled();
    expect(api.unfollow).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("private read failure");
  });

  test("reveals owner management without assembling route-local application chrome", async () => {
    const navigate = vi.fn();
    const resolveOwnerSettingsAccess = vi.fn(async () => true);
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        navigate={navigate}
        pathSegment="xn--pokmon-dva"
        resolveOwnerSettingsAccess={resolveOwnerSettingsAccess}
        // Management authority is account-scoped, so the surface has to resolve
        // an account before it can hold any.
        resolveSession={async () => ({ status: "authenticated", userId: "account-owner", personas: [] })}
      />
    ));

    await vi.waitFor(() => expect(resolveOwnerSettingsAccess).toHaveBeenCalledWith(communityId));
    // Manage lives in the banner's overflow menu, so that an option appearing
    // when authority settles moves nothing on the page beneath it.
    const overflow = container.querySelector<HTMLElement>("[aria-label='More community options']")!;
    await vi.waitFor(() => expect(overflow.getAttribute("data-community-manage")).toBe("available"));
    openOverlay(overflow);
    const manage = await vi.waitFor(() => {
      const item = [...document.body.querySelectorAll<HTMLElement>("[role='menuitem']")]
        .find(entry => entry.textContent?.trim() === "Manage");
      expect(item).toBeDefined();
      return item!;
    });
    activateOverlayItem(manage);
    expect(navigate).toHaveBeenCalledWith("/c/xn--pokmon-dva/settings/moderation_queue");

    expect(container.querySelector("nav[aria-label='Primary navigation']")).toBeNull();
    expect(container.querySelector("[data-application-chrome]")).toBeNull();
  });

  test("does not expose the posting action to a visitor without live membership", async () => {
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={async () => "anonymous"}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post");
    expect(postHere).toBeUndefined();
    expect(contextualComposerOpen()).toBe(false);
  });

  test("renders redacted invalid and unavailable states", async () => {
    const invalid = render(() => <CommunityPage pathSegment="xn--pokmon-dva/next" client={{
      get_cPathSegment: async () => route,
      get_communitiesCommunityIdPreview: async () => preview,
    }} handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }} />);
    await vi.waitFor(() => expect(invalid.querySelector("[data-community-state='invalid']")).not.toBeNull());

    const unavailable = render(() => <CommunityPage pathSegment="xn--pokmon-dva" client={{
      get_cPathSegment: async () => { throw { _tag: "ApiClientProtocolError", message: "credential=secret" }; },
      get_communitiesCommunityIdPreview: async () => preview,
    }} handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }} />);
    await vi.waitFor(() => expect(unavailable.querySelector("[data-community-state='unavailable']")).not.toBeNull());
    expect(unavailable.textContent).not.toContain("credential");
    expect(unavailable.textContent).not.toContain("secret");
  });
});
