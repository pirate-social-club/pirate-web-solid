import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import HomeRoute from "./index.tsx";
import type { SessionResolution } from "../api/session.ts";
import type { VideoHomeReviewItem } from "../features/posts/video-feed/video-home-fixtures.ts";

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

function item(caption: string): VideoHomeReviewItem {
  return {
    id: `video-${caption.toLowerCase().replaceAll(" ", "-")}`,
    communityId: "community-1",
    location: "Harbor",
    palette: "linear-gradient(145deg, #f97316, #172554)",
    publisher: { handle: "captain-one", kind: "profile" },
    caption,
    commentCount: 0,
    likeCount: 1,
    karaoke: "unavailable",
    study: "unknown",
    media: { orientation: "portrait" },
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("video home route", () => {
  test("resolving session keeps the video home visible", () => {
    const pending = new Promise<SessionResolution>(() => {});
    const container = render(() => (
      <HomeRoute
        resolveSession={() => pending}
        items={[item("Public discovery")]}
      />
    ));

    expect(container.querySelector("[data-home-session='resolving']")).not.toBeNull();
    expect(container.textContent).toContain("Public discovery");
  });

  test("anonymous resolution stays on the public feed", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => "anonymous"}
        items={[item("Public discovery")]}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='anonymous']")).not.toBeNull());
    expect(container.textContent).toContain("Public discovery");
  });

  test("session resolution failures settle on the public feed", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => { throw new Error("api unavailable"); }}
        items={[item("Public discovery")]}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='anonymous']")).not.toBeNull());
    expect(container.textContent).toContain("Public discovery");
  });

  test("authenticated resolution keeps the same global video surface", async () => {
    const container = render(() => (
      <HomeRoute
        resolveSession={async () => "authenticated"}
        items={[item("Global video home")]}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-home-session='authenticated']")).not.toBeNull());
    expect(container.textContent).toContain("Global video home");
    expect(container.querySelector("[data-video-home-state='ready']")).not.toBeNull();
  });
});
