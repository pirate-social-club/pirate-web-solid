import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedPage, PublicFeedItem } from "../feed/public-feed-adapter.ts";
import { HomeVideoFeed } from "./home-video-feed.tsx";

const disposers: Array<() => void> = [];

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

function video(mediaRefs: readonly unknown[]): PublicFeedItem {
  return {
    id: "video-1",
    communityId: "community-1",
    communityName: "Harbor",
    communityRouteSlug: "harbor",
    communityAvatarRef: null,
    authorUser: null,
    authorPublicHandle: null,
    anonymousLabel: "Harbor voice",
    identityMode: "anonymous",
    authorshipMode: "human_direct",
    postType: "video",
    status: "published",
    visibility: "public",
    title: null,
    body: null,
    caption: "A harbor update",
    createdAt: "2026-09-01T18:00:00.000Z",
    mediaRefs,
    analysisState: "allow",
    contentSafetyState: "safe",
    ageGatePolicy: "none",
    upvoteCount: 2,
    downvoteCount: 0,
    likeCount: 3,
    commentCount: 1,
    viewerVote: null,
    translationState: "same_language",
    machineTranslated: false,
    translatedTitle: null,
    translatedBody: null,
    translatedCaption: null,
  };
}

function page(items: readonly PublicFeedItem[], nextCursor: string | null): FeedPage {
  return { items, topCommunities: [], nextCursor };
}

test.each(["pending", "unavailable"] as const)("shows typed %s without falling back to media refs", async status => {
  const item = { ...video([{ playback_url: "https://legacy.example/must-not-play.mp4" }]), videoDelivery: { playback: status, thumbnail: status } };
  const container = render(() => <HomeVideoFeed data={page([item], null)} loadPage={async () => page([], null)} />);
  await vi.waitFor(() => expect(container.querySelector("[data-video-playback-state]")?.getAttribute("data-video-playback-state")).toBe(status));
  expect(container.textContent).toContain(status === "pending" ? "Playback is being prepared" : "Playback is unavailable");
  expect(container.querySelector("video, iframe, img[src*='legacy.example']")).toBeNull();
  expect(container.innerHTML).not.toContain("must-not-play");
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("HomeVideoFeed", () => {
  test("walks bounded mixed-feed pages until it finds a playable video", async () => {
    const loadPage = vi.fn(async ({ cursor }: { readonly cursor?: string | null }) => {
      expect(cursor).toBe("page-2");
      return page([video([{ playback_url: "https://media.pirate.test/video-1.mp4" }])], null);
    });
    const container = render(() => (
      <HomeVideoFeed
        data={page([], "page-2")}
        loadPage={loadPage}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src"))
      .toBe("https://media.pirate.test/video-1.mp4"));
    expect(loadPage).toHaveBeenCalledOnce();
  });

  test("states the API media gap instead of rendering a fake video", async () => {
    const container = render(() => (
      <HomeVideoFeed
        data={page([video(["opaque-storage-ref"])], null)}
        loadPage={vi.fn()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Videos are not playable yet"));
    expect(container.textContent).toContain("the API did not provide playable media");
    expect(container.querySelector("video")).toBeNull();
  });
});

test("does not scan past a normalized video when a next cursor exists", async () => {
  const item = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const loadPage = vi.fn(async () => page([], null));
  const container = render(() => <HomeVideoFeed data={page([item], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Playback is being prepared"));
  expect(loadPage).not.toHaveBeenCalled();
});

test("keeps continuation visible after four video-free pages and loads a later video", async () => {
  let loads = 0;
  const loadPage = vi.fn(async () => {
    loads += 1;
    return loads <= 3
      ? page([], "more-pages")
      : page([video([{ playback_url: "https://media.pirate.test/later.mp4" }])], null);
  });
  const container = render(() => <HomeVideoFeed data={page([], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-state]")?.getAttribute("data-video-feed-state")).toBe("ready"));
  expect(loadPage).toHaveBeenCalledTimes(3);
  expect(container.textContent).toContain("No videos yet");
  const continuation = container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]");
  expect(continuation).not.toBeNull();
  continuation!.click();
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/later.mp4"));
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("retains the cursor for retry after a continuation failure", async () => {
  let loads = 0;
  const loadPage = vi.fn(async () => {
    loads += 1;
    if (loads <= 3) return page([], "more-pages");
    if (loads === 4) throw new Error("offline");
    return page([video([{ playback_url: "https://media.pirate.test/retry.mp4" }])], null);
  });
  const container = render(() => <HomeVideoFeed data={page([], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-continuation]")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledTimes(4));
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.disabled).toBe(false));
  expect(container.querySelector("video")).toBeNull();
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/retry.mp4"));
});

test("does not offer continuation at terminal exhaustion in empty and delivery states", async () => {
  const empty = render(() => <HomeVideoFeed data={page([], null)} loadPage={vi.fn()} />);
  await vi.waitFor(() => expect(empty.textContent).toContain("No videos yet"));
  expect(empty.querySelector("[data-video-feed-continuation]")).toBeNull();

  const pending = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const delivery = render(() => <HomeVideoFeed data={page([pending], null)} loadPage={vi.fn()} />);
  await vi.waitFor(() => expect(delivery.textContent).toContain("Playback is being prepared"));
  expect(delivery.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("offers continuation from the delivery branch when a cursor remains", async () => {
  const pending = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const loadPage = vi.fn(async () => page([video([{ playback_url: "https://media.pirate.test/next.mp4" }])], null));
  const container = render(() => <HomeVideoFeed data={page([pending], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Playback is being prepared"));
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/next.mp4"));
  expect(loadPage).toHaveBeenCalledOnce();
});

test("reloads for a new locale identity", async () => {
  const [locale, setLocale] = createSignal<UiLocaleCode>("en");
  const loadPage = vi.fn(async ({ locale: requested }: { readonly locale: UiLocaleCode }) => page(
    [video([{ playback_url: `https://media.pirate.test/${requested}.mp4` }])],
    null,
  ));
  const container = render(() => <HomeVideoFeed data={undefined} loadPage={loadPage} locale={locale()} />);
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/en.mp4"));
  setLocale("ar");
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/ar.mp4"));
  expect(loadPage).toHaveBeenCalledTimes(2);
  expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "ar" }));
});

test("discards an in-flight response from a superseded identity", async () => {
  let releaseEnglish: (value: FeedPage) => void = () => {};
  const english = new Promise<FeedPage>(resolve => { releaseEnglish = resolve; });
  const loadPage = vi.fn(async ({ locale: requested }: { readonly locale: UiLocaleCode }) => {
    if (requested === "en") return english;
    return page([video([{ playback_url: "https://media.pirate.test/ar.mp4" }])], null);
  });
  const [locale, setLocale] = createSignal<UiLocaleCode>("en");
  const container = render(() => <HomeVideoFeed data={undefined} loadPage={loadPage} locale={locale()} />);
  setLocale("ar");
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/ar.mp4"));
  releaseEnglish(page([video([{ playback_url: "https://media.pirate.test/en.mp4" }])], null));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/ar.mp4");
});
