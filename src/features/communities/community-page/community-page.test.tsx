import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import { createMemoryMediaSubmissionStorage } from "../../posts/media-submission/pending.ts";
import CommunityPage from "./community-page.tsx";

const disposers: Array<() => void> = [];

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
  return {
    readViewerState: vi.fn(async () => ({ membership: "not_member" as const, following: false, followerCount: 20 })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona_1" })),
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
  });

  test("requires an explicit persona before mounting persona-authored engagement", async () => {
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
    expect(container.querySelector("button[aria-label='Comments (4)']")).toBeNull();
    expect(container.querySelector("button[aria-label='Open 4 comments']")).not.toBeNull();

    container.querySelector<HTMLButtonElement>("[data-operation-persona] button")!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Persona Two"));
    const personaTwo = document.body.querySelector<HTMLInputElement>("input[value='persona-two']");
    expect(personaTwo).not.toBeNull();
    personaTwo!.click();

    await vi.waitFor(() => expect(container.querySelector("button[aria-label='Comments (4)']")).not.toBeNull());
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
      .find(button => button.textContent?.trim() === "Post here")!;
    postHere.click();

    expect(resolveSession).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Posting in Pirate Harbor"));
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(document.body.querySelector(`[data-community-context='${communityId}']`)).not.toBeNull();
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
      (button) => button.textContent?.trim() === "Post here",
    );
    expect(postHere).toBeDefined();
    postHere!.click();

    await vi.waitFor(() => expect(readViewerState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(container.textContent).toContain("Join this Community before posting."));
    expect(document.body.textContent).not.toContain("Posting in Pirate Harbor");
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
        resolveSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalledWith(communityId));
    const join = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Join")!;
    join.click();
    await vi.waitFor(() => expect(api.join).toHaveBeenCalledWith(communityId, { kind: "create_new" }));
    await vi.waitFor(() => expect(container.textContent).toContain("Joined this Community."));
    expect(join.textContent).toBe("Joined");
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
    const joined = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Joined")!;
    expect(joined.disabled).toBe(true);
    expect(container.textContent).toContain("Post here");
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
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Follow")!
      .click();
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
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Manage"));
    expect(resolveOwnerSettingsAccess).toHaveBeenCalledWith(communityId);
    const manage = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Manage");
    expect(manage).toBeDefined();
    manage!.click();
    expect(navigate).toHaveBeenCalledWith("/c/xn--pokmon-dva/settings/names");

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
      .find(button => button.textContent?.trim() === "Post here");
    expect(postHere).toBeUndefined();
    expect(document.body.textContent).not.toContain("Posting in Pirate Harbor");
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
