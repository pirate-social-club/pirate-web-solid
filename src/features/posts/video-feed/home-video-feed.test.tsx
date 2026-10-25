import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedPage, PublicFeedItem } from "../feed/public-feed-adapter.ts";
import type { FeedPageLoader } from "../feed/public-feed-adapter.ts";
import { HomeVideoFeed, type HomeVideoFeedProps } from "./home-video-feed.tsx";
import { makeStudyAvailabilityLookup } from "./home-feed-study.ts";
import type { PostEngagementTransport } from "../post-engagement/post-engagement-api.ts";
import {
  createMemoryPendingEngagementStorage,
  decodePendingEngagementAction,
  type PendingEngagementStorage,
} from "../post-engagement/post-engagement-pending.ts";

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

// jsdom's media element has no playback; the feed's player expects promises.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
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
  expect(container.textContent).toContain("Nothing here yet");
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
  await vi.waitFor(() => expect(empty.textContent).toContain("Nothing here yet"));
  expect(empty.querySelector("[data-video-feed-continuation]")).toBeNull();

  const pending = { ...video([]), videoDelivery: { playback: "pending" as const, thumbnail: "pending" as const } };
  const processing = render(() => <HomeVideoFeed data={page([pending], null)} loadPage={vi.fn()} />);
  await vi.waitFor(() => expect(processing.textContent).toContain("Videos are being prepared"));
  expect(processing.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("a Stream video row pages in the next video without a continuation button", async () => {
  const ready = { ...video([]), id: "video-ready", caption: "Ready caption", videoDelivery: { playback: "ready" as const, thumbnail: "ready" as const } };
  const loadPage = vi.fn(async () => page([video([{ playback_url: "https://media.pirate.test/next.mp4" }])], null));
  const container = render(() => (
    <HomeVideoFeed
      data={page([ready], "page-2")}
      loadPage={loadPage}
      mintPlaybackAccess={async () => new Promise<never>(() => {})}
    />
  ));
  await vi.waitFor(() => expect(container.querySelector('[data-media-post="video-ready"]')).not.toBeNull());
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(container.querySelector('[data-media-post="video-1"]')).not.toBeNull());
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
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
    return page([{ ...video([{ playback_url: "https://media.pirate.test/retry-direct.mp4" }]), id: "video-retry" }], null);
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
    return page([{ ...video([{ playback_url: "https://media.pirate.test/after-stall.mp4" }]), id: "video-after-stall" }], null);
  });
  const container = render(() => (
    <HomeVideoFeed
      data={page([video([{ playback_url: "https://media.pirate.test/one.mp4" }])], "page-2")}
      loadPage={loadPage}
    />
  ));
  await vi.waitFor(() => expect(container.querySelector("[data-video-feed-continuation]")).not.toBeNull());
  expect(loadPage).toHaveBeenLastCalledWith({ cursor: "page-2", locale: "en", sort: "best" });
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.pirate.test/after-stall.mp4']")).not.toBeNull());
  expect(loadPage).toHaveBeenLastCalledWith({ cursor: "page-3", locale: "en", sort: "best" });
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
  expect(container.textContent).not.toContain("Nothing here yet");
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

const delivered = { playback: "ready", thumbnail: "ready" } as const;
const grantFixture = () => ({
  expiresAt: Date.now() + 300_000,
  renewAt: Date.now() + 240_000,
  url: "https://customer-fixture.cloudflarestream.com/a.b.c/manifest/video.m3u8",
});

test("deduplicates appended rows against retained rows and within the incoming page", async () => {
  const kept = { ...video([]), id: "video-kept", caption: "Original caption", videoDelivery: delivered };
  const added = { ...kept, id: "video-added", caption: "Added caption" };
  let releasePage: (value: FeedPage) => void = () => {};
  const loadPage = vi.fn(() => new Promise<FeedPage>(resolve => { releasePage = resolve; }));
  const mint = vi.fn(async () => grantFixture());
  const container = render(() => (
    <HomeVideoFeed
      data={page([kept], "page-2")}
      loadPage={loadPage}
      mintPlaybackAccess={mint}
      attachPlayback={async () => () => {}}
      resolveSongLink={async () => null}
    />
  ));
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(mint).toHaveBeenCalledOnce());
  const retained = container.querySelector('[data-media-post="video-kept"]');
  const player = retained?.querySelector("video");
  expect(player).not.toBeNull();

  releasePage(page([
    { ...kept, caption: "Duplicate retained caption" },
    added,
    { ...added, caption: "Duplicate incoming caption" },
  ], null));
  await vi.waitFor(() => expect(container.querySelector('[data-media-post="video-added"]')).not.toBeNull());
  expect([...container.querySelectorAll("[data-media-post]")].map(row => row.getAttribute("data-media-post")))
    .toEqual(["video-kept", "video-added"]);
  expect(container.querySelector('[data-media-post="video-kept"]')).toBe(retained);
  expect(retained?.querySelector("video")).toBe(player);
  expect(container.textContent).toContain("Original caption");
  expect(container.textContent).toContain("Added caption");
  expect(container.textContent).not.toContain("Duplicate");
  await vi.waitFor(() => expect(mint).toHaveBeenCalledTimes(2));
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
  expect(loadPage).toHaveBeenCalledOnce();
});

test("rejects a repeated next cursor without accepting rows and retries the same cursor", async () => {
  const kept = { ...video([]), id: "video-kept", caption: "Kept caption", videoDelivery: delivered };
  const rejected = { ...kept, id: "video-rejected", caption: "Rejected caption" };
  const accepted = { ...kept, id: "video-accepted", caption: "Accepted caption" };
  let releasePage: (value: FeedPage) => void = () => {};
  const loadPage = vi.fn<FeedPageLoader>()
    .mockImplementationOnce(() => new Promise<FeedPage>(resolve => { releasePage = resolve; }))
    .mockResolvedValueOnce(page([accepted], null));
  const mint = vi.fn(async () => grantFixture());
  const container = render(() => (
    <HomeVideoFeed
      data={page([kept], "page-2")}
      loadPage={loadPage}
      mintPlaybackAccess={mint}
      attachPlayback={async () => () => {}}
      resolveSongLink={async () => null}
    />
  ));
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(mint).toHaveBeenCalledOnce());
  const retained = container.querySelector('[data-media-post="video-kept"]');
  const player = retained?.querySelector("video");
  expect(player).not.toBeNull();
  releasePage(page([rejected], "page-2"));
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")?.disabled).toBe(false));
  expect(container.querySelector('[data-media-post="video-rejected"]')).toBeNull();
  expect(container.textContent).not.toContain("Rejected caption");
  expect(container.querySelectorAll("[data-media-post]")).toHaveLength(1);
  expect(retained?.querySelector("video")).toBe(player);
  expect(mint).toHaveBeenCalledOnce();

  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector('[data-media-post="video-accepted"]')).not.toBeNull());
  expect(loadPage).toHaveBeenCalledTimes(2);
  for (const [request] of loadPage.mock.calls) expect(request).toEqual({ cursor: "page-2", locale: "en", sort: "best" });
  expect(container.querySelector('[data-media-post="video-kept"]')).toBe(retained);
  expect(retained?.querySelector("video")).toBe(player);
  expect(container.querySelectorAll("[data-media-post]")).toHaveLength(2);
  await vi.waitFor(() => expect(mint).toHaveBeenCalledTimes(2));
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
});

test("keeps continuation actionable when an advancing page contains only duplicate rows", async () => {
  const kept = video([{ playback_url: "https://media.test/kept.mp4" }]);
  let calls = 0;
  const loadPage = vi.fn<FeedPageLoader>(async ({ cursor }) => {
    calls += 1;
    expect(cursor).toBe(calls === 1 ? "page-2" : "page-3");
    return calls === 1
      ? page([{ ...kept, mediaRefs: [{ playback_url: "https://media.test/duplicate.mp4" }] }], "page-3")
      : page([{ ...kept, id: "video-next", mediaRefs: [{ playback_url: "https://media.test/next.mp4" }] }], null);
  });
  const container = render(() => <HomeVideoFeed data={page([kept], "page-2")} loadPage={loadPage} />);
  await vi.waitFor(() => expect(loadPage).toHaveBeenCalledOnce());
  const player = container.querySelector("video");
  expect(player).not.toBeNull();
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")?.disabled).toBe(false));
  expect(container.querySelectorAll("video")).toHaveLength(1);
  expect(container.querySelector("video")).toBe(player);
  expect(player?.getAttribute("src")).toBe("https://media.test/kept.mp4");
  container.querySelector<HTMLButtonElement>("[data-video-feed-continuation]")!.click();
  await vi.waitFor(() => expect(container.querySelector("video[src='https://media.test/next.mp4']")).not.toBeNull());
  expect(loadPage).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll("video")).toHaveLength(2);
  expect(container.querySelector("video")).toBe(player);
  expect(container.querySelector("[data-video-feed-continuation]")).toBeNull();
});

function streamedFeed(options: {
  readonly songTitle?: string;
  readonly navigate?: (href: string) => void;
  readonly studyReady?: boolean;
  readonly karaokeReady?: boolean;
  readonly principalId?: string;
  readonly videoReportsSupported?: boolean;
  readonly membership?: PublicFeedItem["viewerMembershipStatus"];
  readonly reportPost?: PostEngagementTransport["reportPost"];
  readonly pendingStorage?: PendingEngagementStorage;
  readonly authorPersonaId?: string;
  readonly authorPersonas?: HomeVideoFeedProps["authorPersonas"];
  readonly deleteVideo?: HomeVideoFeedProps["deleteVideo"];
} = {}) {
  const item: PublicFeedItem = {
    ...video([]),
    id: "video-stream",
    caption: "Stream caption",
    videoDelivery: delivered,
    songPostId: "post_song",
    songTitle: options.songTitle ?? "Harbor song",
    ...(options.authorPersonaId ? { identityMode: "public", authorPersonaId: options.authorPersonaId } as const : {}),
    ...(options.membership !== undefined ? { viewerMembershipStatus: options.membership } : {}),
  };
  let mints = 0;
  const attached: HTMLVideoElement[] = [];
  const container = render(() => (
    <HomeVideoFeed
      data={page([item], null)}
      loadPage={async () => page([], null)}
      mintPlaybackAccess={async () => { mints += 1; return grantFixture(); }}
      attachPlayback={async (input) => {
        attached.push(input.video);
        input.video.dispatchEvent(new Event("loadedmetadata"));
        return () => {};
      }}
      posterPath={(postId) => `/poster/${postId}.jpg`}
      resolveSongLink={async () => ({
        href: "/posts/harbor-song",
        title: "Harbor song",
        authorName: null,
        activityPaths: { study: "/posts/harbor-song/study", karaoke: "/posts/harbor-song/karaoke" },
        karaokeReady: options.karaokeReady ?? false,
      })}
      studyReady={async () => options.studyReady ?? false}
      {...(options.navigate ? { navigate: options.navigate } : {})}
      {...(options.principalId ? { principalId: options.principalId, sourceIdentity: `user:${options.principalId}` } : {})}
      videoReportsSupported={options.videoReportsSupported ?? true}
      {...(options.reportPost ? { reportTransport: { reportPost: options.reportPost } } : {})}
      pendingStorage={options.pendingStorage ?? createMemoryPendingEngagementStorage()}
      generateIdempotencyKey={() => "feed-report-key"}
      authorPersonas={options.authorPersonas}
      deleteVideo={options.deleteVideo}
    />
  ));
  return { container, mints: () => mints, attached };
}

test("a Stream video renders in the full-screen feed layout with signed playback and no extra chrome", async () => {
  const feed = streamedFeed();
  await vi.waitFor(() => expect(feed.mints()).toBe(1));
  const post = feed.container.querySelector('[data-media-post="video-stream"]');
  expect(post).not.toBeNull();
  // Signed playback is attached to the feed's own video element.
  expect(feed.attached[0]).toBe(post!.querySelector("video"));
  expect(post!.querySelector("video")?.hasAttribute("controls")).toBe(false);
  expect(post!.querySelector("img")?.getAttribute("src")).toBe("/poster/video-stream.jpg");
  expect(feed.container.textContent).toContain("Stream caption");
  expect(feed.container.textContent).toContain("Harbor song");
  // None of the old card's status text or buttons.
  expect(feed.container.textContent).not.toMatch(/Preparing playback|View post|Study/);
  expect(feed.container.querySelector("[data-video-feed-card]")).toBeNull();
});

const phoneMore = async (container: HTMLElement): Promise<HTMLButtonElement> => vi.waitFor(() => {
  const button = container.querySelector<HTMLButtonElement>('[data-media-more="phone"] button');
  if (!button) throw new Error("phone More button not rendered");
  return button;
});

const moreSheetRows = async (): Promise<HTMLButtonElement[]> => vi.waitFor(() => {
  const sheet = document.body.querySelector('[role="dialog"][aria-labelledby]');
  const rows = [...document.body.querySelectorAll<HTMLButtonElement>("[data-media-more-row]")];
  if (!sheet || rows.length === 0) throw new Error("More sheet not open");
  return rows;
});

test("the feed starts muted, and More's Unmute row unmutes; the rail has no mute", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const feed = streamedFeed({ principalId: "user-1" });
  await vi.waitFor(() => expect(feed.mints()).toBe(1));
  expect(feed.container.querySelector('button[aria-label$="mute video"], button[aria-label$="Mute video"]')).toBeNull();
  expect(feed.container.querySelector("video")!.muted).toBe(true);
  (await phoneMore(feed.container)).click();
  const rows = await moreSheetRows();
  expect(rows.map(row => row.textContent)).toEqual(["Unmute"]);
  rows[0]!.click();
  await vi.waitFor(() => expect(feed.container.querySelector("video")!.muted).toBe(false));
  await vi.waitFor(() => expect(document.body.querySelector("[data-media-more-row]")).toBeNull());
  (await phoneMore(feed.container)).click();
  expect((await moreSheetRows()).map(row => row.textContent)).toEqual(["Mute"]);
  play.mockRestore();
});

test("signed-out viewers keep Mute after a tap unmutes, from a More below the Sign in header", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const feed = streamedFeed({});
  await vi.waitFor(() => expect(feed.mints()).toBe(1));
  const more = await phoneMore(feed.container);
  expect(more.closest<HTMLElement>('[data-media-more="phone"]')?.style.top).toContain("4rem");
  more.click();
  const rows = await moreSheetRows();
  expect(rows.map(row => row.textContent)).toEqual(["Unmute"]);
  rows[0]!.click();
  await vi.waitFor(() => expect(feed.container.querySelector("video")!.muted).toBe(false));
  await vi.waitFor(() => expect(document.body.querySelector("[data-media-more-row]")).toBeNull());
  (await phoneMore(feed.container)).click();
  const muteRows = await moreSheetRows();
  expect(muteRows.map(row => row.textContent)).toEqual(["Mute"]);
  muteRows[0]!.click();
  await vi.waitFor(() => expect(feed.container.querySelector("video")!.muted).toBe(true));
  play.mockRestore();
});

describe("Report in the feed", () => {
  test("is left out while the API does not accept reports on video posts", async () => {
    const member = streamedFeed({ principalId: "user-1", membership: "member", videoReportsSupported: false });
    (await phoneMore(member.container)).click();
    expect((await moreSheetRows()).map(row => row.textContent)).toEqual(["Unmute"]);
  });

  test("is offered only to signed-in members of the post's community", async () => {
    const member = streamedFeed({ principalId: "user-1", membership: "member" });
    (await phoneMore(member.container)).click();
    expect((await moreSheetRows()).map(row => row.textContent)).toEqual(["Unmute", "Report"]);
    for (const dispose of disposers.splice(0)) dispose();
    document.body.replaceChildren();

    const nonMember = streamedFeed({ principalId: "user-1", membership: "not_member" });
    (await phoneMore(nonMember.container)).click();
    expect((await moreSheetRows()).map(row => row.textContent)).toEqual(["Unmute"]);
    for (const dispose of disposers.splice(0)) dispose();
    document.body.replaceChildren();

    // Signed out: More offers no Report without an account.
    const signedOut = streamedFeed({ membership: "member" });
    (await phoneMore(signedOut.container)).click();
    expect((await moreSheetRows()).map(row => row.textContent)).toEqual(["Unmute"]);
  });

  test("one tap on a reason sends it once with its idempotency key", async () => {
    let resolveReport: (() => void) | undefined;
    const reportPost = vi.fn<PostEngagementTransport["reportPost"]>(() => new Promise(resolve => {
      resolveReport = () => resolve({ report_id: "report-1", case_ref: "case-1", status: "open" });
    }));
    const storage = createMemoryPendingEngagementStorage();
    const feed = streamedFeed({ principalId: "user-1", membership: "member", reportPost, pendingStorage: storage });
    (await phoneMore(feed.container)).click();
    const report = (await moreSheetRows()).find(row => row.textContent === "Report")!;
    report.click();
    const reasons = await vi.waitFor(() => {
      const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("[data-report-reason]")];
      if (buttons.length !== 7) throw new Error("report reasons not open");
      return buttons;
    });
    expect(reasons.map(reason => reason.textContent)).toEqual([
      "Spam", "Harassment", "Hate", "Sexual content", "Graphic content", "Misleading", "Other",
    ]);
    reasons[1]!.click();
    reasons[1]!.click();
    reasons[3]!.click();
    await vi.waitFor(() => expect(reportPost).toHaveBeenCalledTimes(1));
    await expect(decodePendingEngagementAction(reportPost.mock.calls[0]![0])).resolves.toEqual({
      kind: "post_report", postId: "video-stream", reasonCode: "harassment", idempotencyKey: "feed-report-key",
    });
    resolveReport!();
    await vi.waitFor(() => expect(document.body.querySelector("[data-report-reason]")).toBeNull());
    expect(reportPost).toHaveBeenCalledTimes(1);
    expect(await storage.listForPost("user-1", "video-stream")).toEqual([]);
    expect(feed.container.textContent).toContain("Report sent.");
  });

  test("a failed report stays open and a retry replays the same key", async () => {
    const reportPost = vi.fn<PostEngagementTransport["reportPost"]>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ report_id: "report-1", case_ref: "case-1", status: "open" });
    const feed = streamedFeed({ principalId: "user-1", membership: "member", reportPost });
    (await phoneMore(feed.container)).click();
    (await moreSheetRows()).find(row => row.textContent === "Report")!.click();
    const spam = await vi.waitFor(() => {
      const button = document.body.querySelector<HTMLButtonElement>('[data-report-reason="spam"]');
      if (!button) throw new Error("report reasons not open");
      return button;
    });
    spam.click();
    await vi.waitFor(() => expect(document.body.querySelector('[role="alert"]')).not.toBeNull());
    await vi.waitFor(() => expect(document.body.querySelector<HTMLButtonElement>('[data-report-reason="spam"]')?.disabled).toBe(false));
    document.body.querySelector<HTMLButtonElement>('[data-report-reason="spam"]')!.click();
    await vi.waitFor(() => expect(reportPost).toHaveBeenCalledTimes(2));
    expect(reportPost.mock.calls[1]![0]).toEqual(reportPost.mock.calls[0]![0]);
    await vi.waitFor(() => expect(document.body.querySelector("[data-report-reason]")).toBeNull());
  });
});

test("a failed first page offers Try again, which reloads through the loader", async () => {
  const loadPage = vi.fn(async () => page([video([{ playback_url: "https://media.pirate.test/video-1.mp4" }])], null));
  const failed = Promise.reject(new Error("feed unavailable"));
  failed.catch(() => {});
  const container = render(() => <HomeVideoFeed data={failed} loadPage={loadPage} />);
  const retry = await vi.waitFor(() => {
    const button = [...container.querySelectorAll("button")].find(candidate => candidate.textContent === "Try again");
    if (!button) throw new Error("Try again not rendered");
    return button;
  });
  expect(container.textContent).toContain("Couldn't load the feed.");
  retry.click();
  await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready"));
  expect(loadPage).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-media-post="video-1"]')).not.toBeNull();
});

test("the soundtrack line opens the referenced song", async () => {
  const navigate = vi.fn();
  const feed = streamedFeed({ navigate });
  await vi.waitFor(() => expect(feed.mints()).toBe(1));
  const soundtrack = [...feed.container.querySelectorAll("button")].find(button => button.textContent?.includes("Harbor song"));
  expect(soundtrack).toBeDefined();
  soundtrack!.click();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/posts/harbor-song"));
});

test("Study and Karaoke appear in the rail when ready and open the song's pages", async () => {
  const navigate = vi.fn();
  const feed = streamedFeed({ navigate, studyReady: true, karaokeReady: true });
  const study = await vi.waitFor(() => {
    const button = feed.container.querySelector<HTMLButtonElement>('[data-media-activity="study"]');
    expect(button).not.toBeNull();
    return button!;
  });
  study.click();
  expect(navigate).toHaveBeenCalledWith("/posts/harbor-song/study");
  feed.container.querySelector<HTMLButtonElement>('[data-media-activity="karaoke"]')!.click();
  expect(navigate).toHaveBeenCalledWith("/posts/harbor-song/karaoke");
});

test("only the ready activity shows: Karaoke without aligned lyrics stays hidden", async () => {
  const feed = streamedFeed({ studyReady: true, karaokeReady: false });
  await vi.waitFor(() => expect(feed.container.querySelector('[data-media-activity="study"]')).not.toBeNull());
  expect(feed.container.querySelector('[data-media-activity="karaoke"]')).toBeNull();
});

describe("sign-in continuity", () => {
  const kept = { ...video([]), id: "video-kept", caption: "Kept caption", videoDelivery: delivered };
  const other = { ...video([]), id: "video-other", caption: "Other caption", videoDelivery: delivered };

  function mount() {
    const [identity, setIdentity] = createSignal("anonymous");
    const [data, setData] = createSignal<FeedPage | PromiseLike<FeedPage>>(page([kept], null));
    let mints = 0;
    const container = render(() => (
      <HomeVideoFeed
        data={data()}
        loadPage={async () => page([], null)}
        mintPlaybackAccess={async () => { mints += 1; return grantFixture(); }}
        attachPlayback={async () => () => {}}
        resolveSongLink={async () => null}
        sourceIdentity={identity()}
      />
    ));
    return { container, setIdentity, setData, mints: () => mints };
  }
  const row = (container: HTMLElement, id: string) => container.querySelector(`[data-media-post="${id}"]`);

  test("keeps the mounted player and its grant when the same post survives sign-in", async () => {
    const feed = mount();
    await vi.waitFor(() => expect(feed.mints()).toBe(1));
    const before = row(feed.container, "video-kept");
    feed.setData(page([{ ...kept }], null));
    feed.setIdentity("user:one");
    await vi.waitFor(() => expect(feed.container.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready"));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(row(feed.container, "video-kept")).toBe(before);
    expect(feed.mints()).toBe(1);
  });

  test("a failed signed-in upgrade keeps the public videos playing", async () => {
    const feed = mount();
    await vi.waitFor(() => expect(feed.mints()).toBe(1));
    const before = row(feed.container, "video-kept");
    const failed = Promise.reject(new Error("feed timed out"));
    failed.catch(() => {});
    feed.setData(failed);
    feed.setIdentity("user:one");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(feed.container.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready");
    expect(feed.container.textContent).not.toContain("Couldn't load the feed.");
    expect(row(feed.container, "video-kept")).toBe(before);
    expect(feed.mints()).toBe(1);
  });

  test("drops a post the signed-in page no longer contains", async () => {
    const feed = mount();
    await vi.waitFor(() => expect(feed.mints()).toBe(1));
    feed.setData(page([other], null));
    feed.setIdentity("user:one");
    await vi.waitFor(() => expect(row(feed.container, "video-other")).not.toBeNull());
    expect(row(feed.container, "video-kept")).toBeNull();
  });

  test("an account switch clears the surface and mints again", async () => {
    const feed = mount();
    await vi.waitFor(() => expect(feed.mints()).toBe(1));
    feed.setIdentity("user:one");
    await new Promise(resolve => setTimeout(resolve, 20));
    const signedIn = row(feed.container, "video-kept");
    expect(feed.mints()).toBe(1);
    feed.setData(page([{ ...kept }], null));
    feed.setIdentity("user:two");
    await vi.waitFor(() => expect(feed.mints()).toBe(2));
    expect(row(feed.container, "video-kept")).not.toBe(signedIn);
  });
});


describe("Author deletion in the feed", () => {
  const receipt = { object: "video_post_deletion", community_id: "community-1", post_id: "video-stream", status: "deleted" } as const;
  const owned = { accountId: "author_account", personaIds: ["author_persona"] };
  const button = (text: string) => vi.waitFor(() => {
    const match = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text);
    expect(match).toBeTruthy();
    return match!;
  });
  const openDelete = async (container: HTMLElement) => {
    (await phoneMore(container)).click();
    const rows = await moreSheetRows();
    const row = rows.find(node => node.textContent === "Delete video");
    expect(row).toBeTruthy();
    row!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Delete your video?"));
  };

  test.each([
    { principalId: "author_account", authorPersonas: owned, offered: true },
    { principalId: "other_account", authorPersonas: owned, offered: false },
    { principalId: "author_account", authorPersonas: { ...owned, personaIds: ["other_persona"] }, offered: false },
    { principalId: undefined, authorPersonas: owned, offered: false },
  ])("offers Delete only with the current author's private identity read: $offered", async options => {
    const feed = streamedFeed({ ...options, authorPersonaId: "author_persona", videoReportsSupported: false });
    (await phoneMore(feed.container)).click();
    const rows = (await moreSheetRows()).map(node => node.textContent);
    expect(rows.includes("Delete video")).toBe(options.offered);
    expect(rows.includes("Report")).toBe(false);
  });

  test("requires confirmation, permits cancellation, then removes the confirmed Post and returns focus to the feed", async () => {
    const remove = vi.fn(async () => receipt);
    const feed = streamedFeed({ principalId: "author_account", authorPersonaId: "author_persona", authorPersonas: owned, videoReportsSupported: false, deleteVideo: remove });
    await openDelete(feed.container);
    expect(remove).not.toHaveBeenCalled();
    (await button("Keep video")).click();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Delete your video?"));
    expect(remove).not.toHaveBeenCalled();
    await openDelete(feed.container);
    (await button("Delete video")).click();
    await vi.waitFor(() => expect(feed.container.textContent).toContain("Video deleted."));
    expect(remove.mock.calls).toEqual([["video-stream"]]);
    expect(feed.container.querySelector("video")).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(feed.container.querySelector("main")));
  });

  test("keeps an uncertain target and retries the same video through the visible confirmation", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("reply lost")).mockResolvedValue(receipt);
    const feed = streamedFeed({ principalId: "author_account", authorPersonaId: "author_persona", authorPersonas: owned, deleteVideo: remove });
    await openDelete(feed.container);
    (await button("Delete video")).click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Deletion couldn't be confirmed"));
    (await button("Retry deletion")).click();
    await vi.waitFor(() => expect(feed.container.textContent).toContain("Video deleted."));
    expect(remove.mock.calls).toEqual([["video-stream"], ["video-stream"]]);
  });

  test("deletes successfully when browser site data is blocked", async () => {
    const storage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("site data blocked"); });
    const remove = vi.fn(async () => receipt);
    const feed = streamedFeed({ principalId: "author_account", authorPersonaId: "author_persona", authorPersonas: owned, deleteVideo: remove });
    await openDelete(feed.container);
    expect(document.body.textContent).toContain("This removes your published video.");
    expect(document.body.textContent).not.toContain("from Pirate");
    expect(document.body.textContent).not.toContain("Your private Dance recording");
    (await button("Delete video")).click();
    await vi.waitFor(() => expect(feed.container.textContent).toContain("Video deleted."));
    expect(remove).toHaveBeenCalledOnce();
    expect(feed.container.querySelector("video")).toBeNull();
    expect(storage).not.toHaveBeenCalled();
  });

  test("a completion from the old account cannot remove the next account's visible row or announce success", async () => {
    const [account, setAccount] = createSignal("author_account");
    const item = { ...video([{ playback_url: "https://media.pirate.test/video.mp4" }]), identityMode: "public" as const, authorPersonaId: "author_persona", id: "video-stream" };
    let finish!: (value: typeof receipt) => void;
    const remove = vi.fn(() => new Promise<typeof receipt>(resolve => { finish = resolve; }));
    const container = render(() => <HomeVideoFeed data={page([item], null)} loadPage={async () => page([item], null)}
      principalId={account()} sourceIdentity={`user:${account()}`} authorPersonas={{ accountId: account(), personaIds: account() === "author_account" ? ["author_persona"] : ["other_persona"] }}
      deleteVideo={remove} />);
    await openDelete(container);
    (await button("Delete video")).click();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    setAccount("other_account");
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Delete your video?"));
    finish(receipt);
    await vi.waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    expect(container.textContent).not.toContain("Video deleted.");
  });
});
