import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import HomeRoute from "./index.tsx";
import type { SessionResolution } from "../api/session.ts";
import type { FeedPage } from "../features/posts/feed/public-feed-adapter.ts";

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
});

describe("public-first home route", () => {
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
        resolveSession={async () => ({ status: "authenticated", userId: "user-1" })}
        publicData={page("Public discovery")}
        homeData={page("Personal home")}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='authenticated']")).not.toBeNull());
    expect(container.textContent).toContain("Personal home");
    expect(container.textContent).not.toContain("Public discovery");
    expect(container.querySelector("[data-feed-item-id='post-personal-home']")).not.toBeNull();
  });
});
