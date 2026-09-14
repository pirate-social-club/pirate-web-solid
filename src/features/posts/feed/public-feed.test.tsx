import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import { refreshSession } from "../../../api/session.ts";
import { FeedSurface, PublicFeed } from "./public-feed";
import HomeFeed from "./home-feed.tsx";
import { fetchHomeFeedPage } from "./home-feed-adapter.ts";
import {
  fetchPublicFeedPage,
  type FeedPage as PublicFeedPage,
} from "./public-feed-adapter";
import { publicFeedStagingContractFixture } from "./public-feed-staging-contract.fixture.ts";

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
    canonicalPath: "/posts/a-sovereign-town-square",
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
  test("accepts the sanitized staging shape through the generated client", async () => {
    let request: { readonly credentials: RequestCredentials | undefined; readonly url: string } | undefined;
    const result = await fetchPublicFeedPage({
      origin: "https://solid.example",
      fetchImpl: async (input, init) => {
        request = {
          credentials: init?.credentials,
          url: input instanceof Request ? input.url : input.toString(),
        };
        return new Response(JSON.stringify(publicFeedStagingContractFixture), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    expect(request).toEqual({
      credentials: "omit",
      url: "https://solid.example/api/feed/home/public?locale=en&sort=best",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      canonicalPath: "/posts/sanitized-staging-song",
      id: "fixture-song-1",
      postType: "song",
      title: "Sanitized staging song",
    });
    expect(result.topCommunities).toHaveLength(1);
  });

  test("uses the same current schema for the authenticated home feed", async () => {
    let credentials: RequestCredentials | undefined;
    const result = await fetchHomeFeedPage({
      origin: "https://solid.example",
      fetchImpl: async (_input, init) => {
        credentials = init?.credentials;
        return new Response(JSON.stringify(publicFeedStagingContractFixture), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    });

    expect(credentials).toBe("same-origin");
    expect(result.items.map(item => item.id)).toEqual(["fixture-song-1"]);
  });

  test("renders a truthful public item and has no viewer controls", async () => {
    const container = render(() => <PublicFeed data={page} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull());
    expect(container.textContent).toContain("A sovereign town square");
    expect(container.textContent).toContain("Harbor voice");
    expect(container.textContent).toContain("2 likes");
    expect(container.querySelector("[data-feed-item-id='post-1']")).not.toBeNull();
    expect(container.querySelector("a[href='/posts/a-sovereign-town-square']")?.textContent)
      .toContain("A sovereign town square");
    expect(container.querySelector("input, textarea, [data-viewer-control]")).toBeNull();
  });

  test("renders an explicit empty state", async () => {
    const container = render(() => <PublicFeed data={{ items: [], topCommunities: [], nextCursor: null }} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='empty']")).not.toBeNull());
    expect(container.textContent).toContain("No public posts are available yet.");
  });

  test("links a published song through the API-owned canonical route", async () => {
    const item = page.items[0]!;
    const songPage: PublicFeedPage = {
      ...page,
      items: [{ ...item, id: "post/song-1", postType: "song" }],
    };
    const container = render(() => <PublicFeed data={songPage} />);

    await vi.waitFor(() => expect(container.querySelector("[aria-label='Song activities']")).not.toBeNull());
    expect(container.querySelector("a[href='/posts/a-sovereign-town-square/study']")?.textContent).toContain("Study");
    expect(container.querySelector("a[href='/posts/a-sovereign-town-square/karaoke']")?.textContent).toContain("Karaoke");
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
    const container = render(() => <HomeFeed data={page} engagement={{ principalId: "user-1", personaId: "persona-1" }} />);
    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull());
    expect(container.querySelector("[data-post-engagement-controls][data-viewer-control]")).not.toBeNull();
    expect(container.querySelector("button[aria-label='Upvote']")).not.toBeNull();
    expect(container.querySelector("button[aria-label='Comments (5)']")).not.toBeNull();
  });
});


test("an account change fences an outstanding feed page and leaves pagination retryable", async () => {
  let resolvePage!: (value: Awaited<ReturnType<NonNullable<Parameters<typeof HomeFeed>[0]["client"]>["get_feedHome"]>>) => void;
  const client = { get_feedHome: vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<Parameters<typeof HomeFeed>[0]["client"]>["get_feedHome"]>>>(resolve => { resolvePage = resolve; })) };
  const container = render(() => <HomeFeed data={{ ...page, nextCursor: "next" }} client={client} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Load more"));
  const more = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Load more"));
  more?.click();
  await vi.waitFor(() => expect(client.get_feedHome).toHaveBeenCalledOnce());
  refreshSession();
  resolvePage(publicFeedStagingContractFixture);
  await vi.waitFor(() => expect(more?.disabled).toBe(false));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(container.textContent).not.toContain("Sanitized staging song");
});


test("a locked feed switches to the authenticated read only after proof and retains the surface", async () => {
  const publicRead = vi.fn(async () => ({ ...page, items: [], ageLockedPositions: [0] }));
  const authorizedRead = vi.fn(async () => page);
  const container = render(() => <FeedSurface
    data={{ ...page, items: [], ageLockedPositions: [0] }}
    loadPage={publicRead} loadVerifiedPage={authorizedRead} verifyAge={async () => true}
    copy={{ title: "Feed", subtitle: "", loadingLabel: "Loading", unavailableTitle: "Unavailable", unavailableMessage: "Unavailable", emptyMessage: "Empty" }}
  />);
  await vi.waitFor(() => expect(container.textContent).toContain("Verify 18+ to view"));
  const main = container.querySelector("main");
  container.querySelector("button")?.click();
  await vi.waitFor(() => expect(container.textContent).toContain("A sovereign town square"));
  expect(authorizedRead).toHaveBeenCalledOnce();
  expect(publicRead).not.toHaveBeenCalled();
  expect(container.querySelector("main")).toBe(main);
});
