import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client-community-route";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  test("renders the public community projection and canonical metadata", async () => {
    const container = render(() => <CommunityPage pathSegment="xn--pokmon-dva" client={{
      get_cPathSegment: async () => route,
      get_communitiesCommunityIdPreview: async () => preview,
    }} />);
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Pirate Harbor"));
    expect(container.getAttribute("data-community-state")).toBeNull();
    expect(container.querySelector("[data-community-state='success']")).not.toBeNull();
    expect(container.textContent).toContain("Public conversations.");
    expect(container.textContent).toContain("Respect");
    expect(container.querySelector("button, input, textarea, [data-viewer-control]")).toBeNull();
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href")).toContain("/c/xn--pokmon-dva");
  });

  test("renders redacted invalid and unavailable states", async () => {
    const invalid = render(() => <CommunityPage pathSegment="xn--pokmon-dva/next" client={{
      get_cPathSegment: async () => route,
      get_communitiesCommunityIdPreview: async () => preview,
    }} />);
    await vi.waitFor(() => expect(invalid.querySelector("[data-community-state='invalid']")).not.toBeNull());

    const unavailable = render(() => <CommunityPage pathSegment="xn--pokmon-dva" client={{
      get_cPathSegment: async () => { throw { _tag: "ApiClientProtocolError", message: "credential=secret" }; },
      get_communitiesCommunityIdPreview: async () => preview,
    }} />);
    await vi.waitFor(() => expect(unavailable.querySelector("[data-community-state='unavailable']")).not.toBeNull());
    expect(unavailable.textContent).not.toContain("credential");
    expect(unavailable.textContent).not.toContain("secret");
  });
});
