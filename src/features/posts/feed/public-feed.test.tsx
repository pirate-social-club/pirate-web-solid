import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import { PublicFeed } from "./public-feed";
import HomeFeed from "./home-feed.tsx";
import type { FeedPage as PublicFeedPage } from "./public-feed-adapter";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

const page: PublicFeedPage = {
  items: [{
    id: "post-1",
    communityId: "community-1",
    communityName: "Harbor",
    communityRouteSlug: "harbor",
    communityAvatarRef: null,
    authorUser: null,
    authorPublicHandle: null,
    anonymousLabel: "Harbor voice",
    identityMode: "anonymous",
    authorshipMode: "human_direct",
    postType: "text",
    status: "published",
    visibility: "public",
    title: "A sovereign town square",
    body: "The canonical body is shown without inventing an author.",
    caption: null,
    createdAt: "2025-08-09T13:20:00.000Z",
    mediaRefs: [],
    analysisState: "allow",
    contentSafetyState: "safe",
    ageGatePolicy: "none",
    upvoteCount: 3,
    downvoteCount: 1,
    likeCount: 2,
    commentCount: 5,
    viewerVote: null,
    translationState: "same_language",
    machineTranslated: false,
    translatedTitle: null,
    translatedBody: null,
    translatedCaption: null,
  }],
  topCommunities: [],
  nextCursor: null,
};

describe("PublicFeed", () => {
  test("renders a truthful public item and has no viewer controls", async () => {
    const container = render(() => <PublicFeed data={page} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull());
    expect(container.textContent).toContain("A sovereign town square");
    expect(container.textContent).toContain("Harbor voice");
    expect(container.textContent).toContain("2 likes");
    expect(container.querySelector("[data-feed-item-id='post-1']")).not.toBeNull();
    expect(container.querySelector("input, textarea, [data-viewer-control]")).toBeNull();
  });

  test("renders an explicit empty state", async () => {
    const container = render(() => <PublicFeed data={{ items: [], topCommunities: [], nextCursor: null }} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='empty']")).not.toBeNull());
    expect(container.textContent).toContain("No public posts are available yet.");
  });

  test("renders an explicit unavailable state when the feed request fails", async () => {
    let rejectData: (reason: unknown) => void = () => undefined;
    const data = new Promise<FeedPage>((_, reject) => { rejectData = reject; });
    const container = render(() => <PublicFeed data={data} />);
    rejectData(new Error("api unavailable"));

    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='error']")).not.toBeNull());
    expect(container.textContent).toContain("Public feed unavailable");
    expect(container.textContent).toContain("The public feed is temporarily unavailable.");
  });

  test("loads the next page with the opaque cursor", async () => {
    let requestedCursor: string | null = null;
    const client = {
      get_feedHomePublic: async (input: { query?: { cursor?: string | null } }) => {
        requestedCursor = input.query?.cursor ?? null;
        return {
          items: [],
          top_communities: [],
          next_cursor: null,
        };
      },
    };
    const container = render(() => <PublicFeed client={client} data={{ ...page, nextCursor: "900719925474099312345" }} />);
    await vi.waitFor(() => expect(container.querySelector("button")).not.toBeNull());
    container.querySelector("button")?.click();
    await vi.waitFor(() => expect(requestedCursor).toBe("900719925474099312345"));
    await vi.waitFor(() => expect(container.querySelector("button")).toBeNull());
  });
});

describe("HomeFeed engagement", () => {
  test("adds viewer controls only to the authenticated surface", async () => {
    const container = render(() => <HomeFeed data={page} engagement={{ principalId: "user-1" }} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull());
    expect(container.querySelector("[data-post-engagement-controls][data-viewer-control]")).not.toBeNull();
    expect(container.querySelector("button[aria-label='Upvote']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='Comments (5)']")).not.toBeNull();
  });
});
