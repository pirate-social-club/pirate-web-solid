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

test.each(["pending", "unavailable"] as const)("does not expose a %s video as a feed item or fall back to media refs", async status => {
  const item = { ...video([{ playback_url: "https://legacy.example/must-not-play.mp4" }]), videoDelivery: { playback: status, thumbnail: status } };
  const container = render(() => <HomeVideoFeed data={page([item], null)} loadPage={async () => page([], null)} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Videos are being prepared"));
  expect(container.querySelector("[data-video-playback-state]")).toBeNull();
  expect(container.querySelector("[data-video-feed-card]")).toBeNull();
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

  test("names a waiting video without rendering a fake video", async () => {
    const container = render(() => (
      <HomeVideoFeed
        data={page([video(["opaque-storage-ref"])], null)}
        loadPage={vi.fn()}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Videos are being prepared"));
    expect(container.textContent).toContain("Published videos appear here as soon as playback is ready.");
    expect(container.querySelector("video")).toBeNull();
  });
});

test("scans past a processing video to a later playable page", async () => {
  const processing = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const loadPage = vi.fn(async () => page([video([{ playback_url: "https://media.pirate.test/after-processing.mp4" }])], null));
  const container = render(() => <HomeVideoFeed data={page([processing], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://media.pirate.test/after-processing.mp4"));
  expect(loadPage).toHaveBeenCalledOnce();
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

test("does not offer continuation at terminal exhaustion in empty and processing states", async () => {
  const empty = render(() => <HomeVideoFeed data={page([], null)} loadPage={vi.fn()} />);
  await vi.waitFor(() => expect(empty.textContent).toContain("No videos yet"));
  expect(empty.querySelector("[data-video-feed-continuation]")).toBeNull();

  const pending = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const processing = render(() => <HomeVideoFeed data={page([pending], null)} loadPage={vi.fn()} />);
  await vi.waitFor(() => expect(processing.textContent).toContain("Videos are being prepared"));
  expect(processing.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("offers continuation after a playable delivery row when a cursor remains", async () => {
  const ready = { ...video([]), id: "video-ready", caption: "Ready caption", videoDelivery: { playback: "ready" as const, thumbnail: "ready" as const } };
  const loadPage = vi.fn(async () => page([video([{ playback_url: "https://media.pirate.test/next.mp4" }])], null));
  const container = render(() => (
    <HomeVideoFeed
      data={page([ready], "page-2")}
      loadPage={loadPage}
      mintPlaybackAccess={async () => new Promise<never>(() => {})}
    />
  ));
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-card]")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/next.mp4']")).not.toBeNull());
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

test("an age-locked feed offers in-place verification without inventing a video or resetting its scroll region", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const first = { ...page([], null), ageLockedPositions: [0] };
  const unlocked = page([video([{ playback_url: "https://media.test/authorized.mp4" }])], null);
  const verify = vi.fn(async () => true);
  const load = vi.fn(async () => unlocked);
  const container = render(() => <HomeVideoFeed data={first} loadPage={load} verifyAge={verify} />);
  await vi.waitFor(() => expect(container.querySelector("[data-age-access-prompt]")).not.toBeNull());
  expect(container.querySelector("video, img")).toBeNull();
  expect(container.textContent).not.toContain("No videos yet");
  const region = container.querySelector('[role="region"]');
  if (!(region instanceof HTMLElement)) throw new Error("feed scroll region missing");
  region.scrollTop = 57;
  const button = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Verify 18+"));
  button?.click();
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(container.querySelector("[data-age-access-prompt]")).toBeNull());
  expect(container.querySelector('[role="region"]')).toBe(region);
  expect(region.scrollTop).toBe(57);
  expect(container.querySelector("video")?.autoplay).toBe(false);
  expect(play).not.toHaveBeenCalled();
  play.mockRestore();
});

test("cancelling age verification keeps the locked row and does not refetch or play content", async () => {
  const load = vi.fn(async () => page([], null));
  const container = render(() => <HomeVideoFeed data={{ ...page([], null), ageLockedPositions: [0] }} loadPage={load} verifyAge={async () => false} />);
  await vi.waitFor(() => expect(container.querySelector("[data-age-access-prompt]")).not.toBeNull());
  [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Verify 18+"))?.click();
  await vi.waitFor(() => expect(container.querySelector("button")?.disabled).toBe(false));
  expect(load).not.toHaveBeenCalled();
  expect(container.querySelector("video")).toBeNull();
});

test("renders the Study action only for a playable video whose referenced song is ready", async () => {
  const loadStudyAvailability = vi.fn(async (songPostId: string) => songPostId === "post_song");
  const delivery = { playback: "ready", thumbnail: "ready" } as const;
  const linked = { ...video([]), id: "video-linked", caption: "Linked caption", videoDelivery: delivery, songPostId: "post_song" };
  const unlinked = { ...video([]), id: "video-unlinked", caption: "Unlinked caption", videoDelivery: delivery };
  const unavailable = { ...video([]), id: "video-unavailable", caption: "Unavailable caption", videoDelivery: delivery, songPostId: "post_song_unavailable" };
  const container = render(() => (
    <HomeVideoFeed
      data={page([linked, unlinked, unavailable], null)}
      loadPage={async () => page([], null)}
      loadStudyAvailability={loadStudyAvailability}
      mintPlaybackAccess={async () => new Promise<never>(() => {})}
      resolveSongLink={async () => null}
    />
  ));

  await vi.waitFor(() => expect(container.querySelectorAll("[data-video-feed-study]")).toHaveLength(1));
  const study = container.querySelector<HTMLAnchorElement>("[data-video-feed-study]");
  expect(study?.getAttribute("href")).toBe("/p/post_song/study");
  const rows = [...container.querySelectorAll('[role="region"] > div')];
  const linkedRow = rows.find(row => row.textContent?.includes("Linked caption"));
  const unlinkedRow = rows.find(row => row.textContent?.includes("Unlinked caption"));
  const unavailableRow = rows.find(row => row.textContent?.includes("Unavailable caption"));
  expect(linkedRow?.querySelector("[data-video-feed-study]")).not.toBeNull();
  expect(unlinkedRow?.querySelector("[data-video-feed-study]")).toBeNull();
  expect(unavailableRow?.querySelector("[data-video-feed-study]")).toBeNull();
  expect(loadStudyAvailability.mock.calls.map(([songPostId]) => songPostId).sort()).toEqual(["post_song", "post_song_unavailable"]);
});
