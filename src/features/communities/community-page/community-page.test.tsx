import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client-community-route";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { PrivySessionExchange } from "../../../api/privy-session.ts";
import CommunityPage from "./community-page.tsx";

const disposers: Array<() => void> = [];

function signInExchange(): PrivySessionExchange {
  return {
    beginOAuth: async () => "https://privy.example.test/authorize",
    clear: () => {},
    completeOAuth: async () => undefined,
    loginWithCode: async () => undefined,
    loginWithWallet: async () => undefined,
    register: async () => undefined,
    sendCode: async () => undefined,
  };
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
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        resolveSession={resolveSession}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    expect(resolveSession).not.toHaveBeenCalled();

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post here")!;
    postHere.click();

    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Posting in Pirate Harbor"));
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(document.body.querySelector(`[data-community-context='${communityId}']`)).not.toBeNull();
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

  test("opens sign-in instead of an unscoped composer for an anonymous visitor", async () => {
    const container = render(() => (
      <CommunityPage
        client={{
          get_cPathSegment: async () => route,
          get_communitiesCommunityIdPreview: async () => preview,
        }}
        handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        pathSegment="xn--pokmon-dva"
        createSignInExchange={async () => signInExchange()}
        resolveSession={async () => "anonymous"}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));

    const postHere = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Post here")!;
    postHere.click();

    await vi.waitFor(() => expect(document.body.querySelector("[aria-label='Join Pirate']")).not.toBeNull());
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
