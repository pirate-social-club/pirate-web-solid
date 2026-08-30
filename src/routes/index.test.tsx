import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import HomeRoute from "./index.tsx";
import type { SessionResolution } from "../api/session.ts";
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
      postType: "text",
      status: "published",
      visibility: "public",
      title,
      body: `${title} body`,
      caption: null,
      createdAt: "2025-08-09T13:20:00.000Z",
      mediaRefs: [],
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

    await vi.waitFor(() => expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull());
    expect(container.textContent).toContain("Sanitized staging song");
    expect(container.querySelector("[data-feed-item-id='fixture-song-1']")).not.toBeNull();
    expect(container.textContent).not.toContain("Public feed unavailable");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("resolving session keeps public discovery visible", () => {
    const pending = new Promise<SessionResolution>(() => {});
    const container = render(() => (
      <HomeRoute
        resolveSession={() => pending}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    expect(container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    expect(container.textContent).toContain("Public discovery");
    expect(container.textContent).not.toContain("Personal home");
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
    expect(container.querySelector("[data-feed-item-id='post-personal-home']")).not.toBeNull();
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

  test("mounts the text-post coordinator only after authentication supplies a principal", async () => {
    const open = vi.fn((_name: string) => { throw new Error("fixture open proves coordinator mount"); });
    vi.stubGlobal("indexedDB", { open });
    let resolveSession!: (value: SessionResolution) => void;
    const pending = new Promise<SessionResolution>(resolve => { resolveSession = resolve; });
    const container = render(() => (
      <HomeRoute
        resolveSession={() => pending}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    expect(container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    resolveSession({ status: "authenticated", userId: "user-one", personas: [] });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    expect(open.mock.calls.some(([name]) => name === "pirate-post-composer-v2:principal:user-one")).toBe(true);
    const createPost = [...container.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Create post"));
    expect(createPost).toBeDefined();
    createPost?.click();
    await vi.waitFor(() => expect(document.body.querySelector("[role='dialog']")).not.toBeNull());
  });
});
