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

test("coalesces consecutive continuation attempts into one page request", async () => {
  let scanCalls = 0;
  let releasePage: (value: FeedPage) => void = () => {};
  const loadPage = vi.fn(() => {
    scanCalls += 1;
    if (scanCalls <= 3) return Promise.resolve(page([], "more-pages"));
    return new Promise<FeedPage>(resolve => { releasePage = resolve; });
  });
  const container = render(() => <HomeVideoFeed data={page([], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-continuation]")).not.toBeNull());
  expect(loadPage).toHaveBeenCalledTimes(3);
  const button = container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!;
  button.click();
  // Neutralize the UI hint so the second dispatch reaches the request-level
  // guard this test owns.
  button.disabled = false;
  button.click();
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledTimes(4));
  releasePage(page([video([{ playback_url: "https://media.pirate.test/once.mp4" }])], null));
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/once.mp4']")).not.toBeNull());
  expect(container.querySelectorAll("video")).toHaveLength(1);
});

test("offers retry in the direct-URL branch after a failed page request", async () => {
  let calls = 0;
  const loadPage = vi.fn(async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return page([video([{ playback_url: "https://media.pirate.test/retry-direct.mp4" }])], null);
  });
  const container = render(() => (
    <HomeVideoFeed
      data={page([video([{ playback_url: "https://media.pirate.test/one.mp4" }])], "page-2")}
      loadPage={loadPage}
    />
  ));
  // The automatic end trigger fires on mount and fails without moving the
  // active index, so the explicit continuation is the only retry path.
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-continuation]")).not.toBeNull());
  expect(loadPage).toHaveBeenCalledOnce();
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/retry-direct.mp4']")).not.toBeNull());
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("offers continuation when a direct-URL page adds no playable videos", async () => {
  let calls = 0;
  const loadPage = vi.fn(async () => {
    calls += 1;
    if (calls === 1) return page([video(["opaque-storage-ref"])], "page-3");
    return page([video([{ playback_url: "https://media.pirate.test/after-stall.mp4" }])], null);
  });
  const container = render(() => (
    <HomeVideoFeed
      data={page([video([{ playback_url: "https://media.pirate.test/one.mp4" }])], "page-2")}
      loadPage={loadPage}
    />
  ));
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-continuation]")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/after-stall.mp4']")).not.toBeNull());
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("discards a stale pagination completion after the input identity changes", async () => {
  let releaseStale: (value: FeedPage) => void = () => {};
  let englishCalls = 0;
  const [locale, setLocale] = createSignal<UiLocaleCode>("en");
  const loadPage = vi.fn(({ locale: requested }: { readonly locale: UiLocaleCode }) => {
    if (requested === "ar") {
      return Promise.resolve(page([video([{ playback_url: "https://media.pirate.test/ar.mp4" }])], null));
    }
    englishCalls += 1;
    if (englishCalls === 1) {
      return Promise.resolve(page([
        video([{ playback_url: "https://media.pirate.test/base-one.mp4" }]),
        { ...video([]), id: "base-two", mediaRefs: [{ playback_url: "https://media.pirate.test/base-two.mp4" }] },
      ], "page-2"));
    }
    return new Promise<FeedPage>(resolve => { releaseStale = resolve; });
  });
  const container = render(() => <HomeVideoFeed data={undefined} loadPage={loadPage} locale={locale()} />);
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/base-two.mp4']")).not.toBeNull());
  // Two posts leave the active index at the end threshold, so the automatic
  // end trigger starts the pagination request under the current identity.
  await vi.waitFor(() => expect(englishCalls).toBe(2));
  setLocale("ar");
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/ar.mp4']")).not.toBeNull());
  releaseStale(page([video([{ playback_url: "https://media.pirate.test/stale.mp4" }])], "page-3"));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(container.querySelector("video[src='https://media.pirate.test/stale.mp4']")).toBeNull();
  expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/ar.mp4");
});
