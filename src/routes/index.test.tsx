import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import HomeRoute from "./index.tsx";
import type { AccountSessionResolution } from "../api/session.ts";
import type { FeedPage } from "../features/posts/feed/public-feed-adapter.ts";
import { publicFeedStagingContractFixture } from "../features/posts/feed/public-feed-staging-contract.fixture.ts";

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

function page(title: string): FeedPage {
  return {
    items: [{
      id: `post-${title.toLowerCase().replaceAll(" ", "-")}`,
      communityId: "community-1",
      communityName: "Harbor",
      communityRouteSlug: "harbor",
      communityAvatarRef: null,
      authorUser: "user-1",
      authorPublicHandle: "captain-one",
      anonymousLabel: null,
      identityMode: "public",
      authorshipMode: "human_direct",
      postType: "video",
      status: "published",
      visibility: "public",
      title,
      body: `${title} body`,
      caption: null,
      createdAt: "2025-08-09T13:20:00.000Z",
      mediaRefs: [{ playback_url: `https://media.pirate.test/${title.toLowerCase().replaceAll(" ", "-")}.mp4` }],
      analysisState: "allow",
      contentSafetyState: "safe",
      ageGatePolicy: "none",
      upvoteCount: 1,
      downvoteCount: 0,
      likeCount: 1,
      commentCount: 0,
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
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

describe("public-first home route", () => {
  test("renders the sanitized staging response through the production feed client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(url.pathname).toBe("/api/feed/home/public");
      return new Response(JSON.stringify(publicFeedStagingContractFixture), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const container = render(() => (
      <HomeRoute resolveSession={async () => "anonymous"} />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-video-feed-state='ready']")).not.toBeNull());
    expect(container.textContent).toContain("No videos yet");
    expect(container.textContent).not.toContain("Video feed unavailable");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("resolving session keeps public discovery visible", async () => {
    const pending = new Promise<AccountSessionResolution>(() => {});
    const container = render(() => (
      <HomeRoute
        resolveSession={() => pending}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    expect(container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    await vi.waitFor(() => expect(container.textContent).toContain("Public discovery"));
    expect(container.textContent).not.toContain("Personal home");
  });

  test("publisher clicks preserve the legacy public-profile destination", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <HomeRoute
        navigate={navigate}
        resolveSession={async () => "anonymous"}
        publicData={page("Public discovery")}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Public discovery"));
    const publisher = [...container.querySelectorAll("button")]
      .find(button => button.textContent?.includes("@captain-one"));
    expect(publisher).toBeDefined();
    publisher?.click();
    expect(navigate).toHaveBeenCalledWith("/u/captain-one");
  });

  test("anonymous resolution stays on the public feed", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => "anonymous"}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='anonymous']")).not.toBeNull());
    expect(container.textContent).toContain("Public discovery");
    expect(container.textContent).not.toContain("Personal home");
  });

  test("session resolution failures settle on the public feed", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => { throw new Error("api unavailable"); }}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='anonymous']")).not.toBeNull());
    expect(container.textContent).toContain("Public discovery");
    expect(container.textContent).not.toContain("Personal home");
  });

  test("authenticated resolution swaps public discovery for home", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas: [] })}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='authenticated']")).not.toBeNull());
    expect(container.textContent).toContain("Personal home");
    expect(container.textContent).not.toContain("Public discovery");
    expect(container.querySelector("video[src='https://media.pirate.test/personal-home.mp4']")).not.toBeNull();
  });

  test("does not mount or open text-post storage for an anonymous session", async () => {
    const open = vi.fn(() => { throw new Error("IndexedDB should remain unopened"); });
    vi.stubGlobal("indexedDB", { open });
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => "anonymous"}
        publicData={page("Public discovery")}
      />
    ));

    expect(open).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    await vi.waitFor(() => expect(container.querySelector("[data-home-session='anonymous']")).not.toBeNull());
    expect(open).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });

  test("keeps route-local creation controls out of the authenticated video surface", async () => {
    const open = vi.fn((_name: string) => { throw new Error("Fixture storage is unavailable"); });
    vi.stubGlobal("indexedDB", { open });
    let resolveSession!: (value: AccountSessionResolution) => void;
    const pending = new Promise<AccountSessionResolution>(resolve => { resolveSession = resolve; });
    const container = render(() => (
      <HomeRoute
        resolveSession={() => pending}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    expect(container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    expect(open.mock.calls.some(([name]) => String(name).startsWith("pirate-post-composer-v2:"))).toBe(false);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    resolveSession({ status: "authenticated", userId: "user-one" });
    await vi.waitFor(() => expect(container.querySelector("[data-home-session='authenticated']")).not.toBeNull());
    expect(open.mock.calls.some(([name]) => String(name).startsWith("pirate-post-composer-v2:"))).toBe(false);
    expect(container.textContent).not.toContain("Create post");
    expect(container.textContent).not.toContain("Create community");
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });
});
