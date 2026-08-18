import { fireEvent, screen, within } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { createSignal, flush } from "solid-js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import type { MediaPostData } from "./types";
import { VerticalFeed } from "./vertical-feed";

// jsdom leaves HTMLMediaElement playback unimplemented; stub it locally.
const playMock = vi.fn<() => Promise<void>>(() => Promise.resolve());
const pauseMock = vi.fn();
const loadMock = vi.fn();

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: playMock,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    writable: true,
    value: pauseMock,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    writable: true,
    value: loadMock,
  });
});

beforeEach(() => {
  playMock.mockClear();
  pauseMock.mockClear();
  loadMock.mockClear();
});

const testPosts: MediaPostData[] = [
  {
    id: "post-1",
    videoUrl: "/clip-1.mp4",
    posterUrl: "/poster-1.jpg",
    authorName: "wavemaker",
    caption: "First post.",
    title: "Neon Skyline",
    artist: "Glass Avenue",
    likeCount: 1234,
    isLiked: false,
    isFollowing: false,
  },
  {
    id: "post-2",
    videoUrl: "/clip-2.mp4",
    posterUrl: "/poster-2.jpg",
    authorName: "nightowl",
    caption: "Second post.",
    likeCount: 5678,
    isLiked: true,
    isFollowing: false,
  },
  {
    id: "post-3",
    videoUrl: "/clip-3.mp4",
    posterUrl: "/poster-3.jpg",
    authorName: "stargazer",
    caption: "Third post.",
    likeCount: 12400,
    isLiked: false,
    isFollowing: true,
  },
];

function pressArrow(key: "ArrowDown" | "ArrowUp") {
  const region = screen.getByRole("region", { name: "Media feed" });
  fireEvent.keyDown(region, { key });
  flush();
}

describe("VerticalFeed", () => {
  it("renders every post with author, caption, and formatted like count", () => {
    const container = render(() => (
      <VerticalFeed posts={testPosts} onLikeClick={vi.fn()} />
    ));
    flush();

    const view = within(container);
    expect(view.getAllByText("@wavemaker").length).toBeGreaterThan(0);
    expect(view.getAllByText("@nightowl").length).toBeGreaterThan(0);
    expect(view.getAllByText("@stargazer").length).toBeGreaterThan(0);
    expect(view.getAllByText("1.2K").length).toBeGreaterThan(0);
    expect(view.getAllByRole("button", { name: "Like video" })).toHaveLength(4);
  });

  it("hides action buttons whose callbacks are absent, except mute", () => {
    const container = render(() => (
      <VerticalFeed posts={testPosts} onLikeClick={vi.fn()} />
    ));
    flush();

    const view = within(container);
    // Wired: like stays. Unwired: share, follow, author, soundtrack hide.
    expect(view.getAllByRole("button", { name: "Like video" })).toHaveLength(4);
    expect(
      view.queryByRole("button", { name: "Share video" }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("button", { name: /Follow / }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("button", { name: /'s profile/ }),
    ).not.toBeInTheDocument();
    expect(
      view.queryByRole("button", { name: /^Open / }),
    ).not.toBeInTheDocument();
    // Mute is local playback state and stays visible.
    expect(view.getAllByRole("button", { name: "Mute video" })).toHaveLength(6);
    // Author and soundtrack lines degrade to non-interactive text.
    expect(view.getAllByText("@wavemaker").length).toBeGreaterThan(0);
    expect(view.getAllByText(/Neon Skyline/).length).toBeGreaterThan(0);
  });

  it("emits onActivePostChange for the first post on mount", () => {
    const onActivePostChange = vi.fn();
    render(() => (
      <VerticalFeed posts={testPosts} onActivePostChange={onActivePostChange} />
    ));
    flush();

    expect(onActivePostChange).toHaveBeenCalledWith("post-1", 0);
  });

  it("changes the active post with ArrowDown and ArrowUp", () => {
    const onActivePostChange = vi.fn();
    render(() => (
      <VerticalFeed posts={testPosts} onActivePostChange={onActivePostChange} />
    ));
    flush();

    pressArrow("ArrowDown");
    expect(onActivePostChange).toHaveBeenCalledWith("post-2", 1);

    pressArrow("ArrowDown");
    expect(onActivePostChange).toHaveBeenCalledWith("post-3", 2);

    pressArrow("ArrowUp");
    expect(onActivePostChange).toHaveBeenCalledWith("post-2", 1);
  });

  it("does not navigate past the first or last post", () => {
    const onActivePostChange = vi.fn();
    render(() => (
      <VerticalFeed posts={testPosts} onActivePostChange={onActivePostChange} />
    ));
    flush();
    onActivePostChange.mockClear();

    pressArrow("ArrowUp");
    expect(onActivePostChange).not.toHaveBeenCalled();
  });

  it("emits onEndReached when the active post nears the end", () => {
    const onEndReached = vi.fn();
    render(() => (
      <VerticalFeed posts={testPosts} hasMore onEndReached={onEndReached} />
    ));
    flush();

    pressArrow("ArrowDown");
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("emits like, share, follow, and author callbacks with the post id", async () => {
    const user = userEvent.setup();
    const onLikeClick = vi.fn();
    const onShareClick = vi.fn();
    const onFollowClick = vi.fn();
    const onAuthorClick = vi.fn();
    const container = render(() => (
      <VerticalFeed
        posts={testPosts}
        onLikeClick={onLikeClick}
        onShareClick={onShareClick}
        onFollowClick={onFollowClick}
        onAuthorClick={onAuthorClick}
      />
    ));
    flush();

    const view = within(container);
    await user.click(view.getAllByRole("button", { name: "Like video" })[0]);
    expect(onLikeClick).toHaveBeenCalledWith("post-1");

    await user.click(view.getAllByRole("button", { name: "Share video" })[0]);
    expect(onShareClick).toHaveBeenCalledWith("post-1");

    await user.click(
      view.getAllByRole("button", { name: "Follow wavemaker" })[0],
    );
    expect(onFollowClick).toHaveBeenCalledWith("post-1");

    await user.click(
      view.getAllByRole("button", { name: "View wavemaker's profile" })[0],
    );
    expect(onAuthorClick).toHaveBeenCalledWith("post-1");
  });

  it("keeps playback gated until the first user interaction", async () => {
    const user = userEvent.setup();
    const container = render(() => <VerticalFeed posts={testPosts} />);
    flush();

    // No autoplay attempt before interaction, even for the active post.
    expect(playMock).not.toHaveBeenCalled();

    const playButtons = within(container).getAllByRole("button", {
      name: "Play video",
    });
    expect(playButtons.length).toBeGreaterThan(0);

    await user.click(playButtons[0]);
    flush();

    expect(playMock).toHaveBeenCalled();
    expect(
      within(container).getAllByRole("button", { name: "Pause video" })[0],
    ).toBeInTheDocument();
  });

  it("emits onMuteToggle with the post id and the new muted state", async () => {
    const user = userEvent.setup();
    const onMuteToggle = vi.fn();
    const container = render(() => (
      <VerticalFeed posts={testPosts} onMuteToggle={onMuteToggle} />
    ));
    flush();

    await user.click(
      within(container).getAllByRole("button", { name: "Mute video" })[0],
    );
    expect(onMuteToggle).toHaveBeenCalledWith("post-1", true);
  });

  it("applies controlled mute state to the active media post", () => {
    const container = render(() => <VerticalFeed posts={testPosts} muted />);
    flush();

    expect(
      within(container).getAllByRole("button", { name: "Unmute video" })[0],
    ).toBeInTheDocument();
    expect(container.querySelector("video")?.muted).toBe(true);
  });

  it("reports an implicit unmute when play is pressed on controlled muted media", async () => {
    const user = userEvent.setup();
    const onMuteToggle = vi.fn();
    const [muted, setMuted] = createSignal(true);
    const container = render(() => (
      <VerticalFeed
        posts={testPosts}
        muted={muted()}
        onMuteToggle={(id, nextMuted) => {
          onMuteToggle(id, nextMuted);
          setMuted(nextMuted);
        }}
      />
    ));
    flush();

    const activeVideo = container.querySelector("video")!;
    fireEvent(activeVideo, new Event("loadedmetadata"));
    flush();
    await user.click(
      within(container).getAllByRole("button", { name: "Play video" })[0],
    );
    flush();

    expect(onMuteToggle).toHaveBeenCalledWith("post-1", false);
    expect(container.querySelector("video")?.muted).toBe(false);
  });

  it("pauses an active post while a host panel is open", async () => {
    const user = userEvent.setup();
    const [pausedPostId, setPausedPostId] = createSignal<string>();
    const container = render(() => (
      <VerticalFeed posts={testPosts} pausedPostId={pausedPostId()} />
    ));
    flush();

    const activeVideo = container.querySelector("video")!;
    fireEvent(activeVideo, new Event("loadedmetadata"));
    flush();
    await user.click(
      within(container).getAllByRole("button", { name: "Play video" })[0],
    );
    flush();
    expect(
      within(container).getAllByRole("button", { name: "Pause video" })[0],
    ).toBeInTheDocument();

    Object.defineProperty(activeVideo, "paused", {
      configurable: true,
      value: false,
    });
    const pauseCallsBefore = pauseMock.mock.calls.length;
    setPausedPostId("post-1");
    flush();
    expect(pauseMock.mock.calls.length).toBeGreaterThan(pauseCallsBefore);
    expect(
      within(container).getAllByRole("button", { name: "Play video" })[0],
    ).toBeInTheDocument();
  });

  it("emits onViewed once after three seconds of cumulative watch time", async () => {
    const user = userEvent.setup();
    const onViewed = vi.fn();
    const container = render(() => (
      <VerticalFeed posts={testPosts} onViewed={onViewed} />
    ));
    flush();

    await user.click(
      within(container).getAllByRole("button", { name: "Play video" })[0],
    );
    flush();

    const video = container.querySelector("video")!;
    for (const time of [0.5, 1, 1.5, 2, 2.5, 3]) {
      Object.defineProperty(video, "currentTime", {
        configurable: true,
        value: time,
      });
      fireEvent(video, new Event("timeupdate"));
    }

    expect(onViewed).toHaveBeenCalledTimes(1);
    expect(onViewed).toHaveBeenCalledWith("post-1");
  });

  it("reports playback progress for the media post that emitted it", () => {
    const onTimeUpdate = vi.fn();
    const container = render(() => (
      <VerticalFeed posts={testPosts} onTimeUpdate={onTimeUpdate} />
    ));
    flush();

    const video = container.querySelector("video")!;
    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 12.5 },
      duration: { configurable: true, value: 40 },
    });
    fireEvent(video, new Event("timeupdate"));

    expect(onTimeUpdate).toHaveBeenCalledWith("post-1", 12.5, 40);
  });

  it("can hide shared media chrome for a product-owned overlay", () => {
    const container = render(() => (
      <VerticalFeed posts={testPosts.slice(0, 1)} showChrome={false} />
    ));
    flush();

    expect(container.querySelector("video")).toBeInTheDocument();
    expect(within(container).queryByText("@wavemaker")).not.toBeInTheDocument();
    expect(
      within(container).queryByRole("button", { name: "Like" }),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no posts", () => {
    render(() => <VerticalFeed posts={[]} />);
    flush();

    expect(screen.getByText("No posts to show")).toBeVisible();
  });

  it("shows a loading row while more posts load", () => {
    render(() => <VerticalFeed posts={testPosts.slice(0, 1)} loading hasMore />);
    flush();

    expect(
      screen.getByRole("status", { name: "Loading more posts" }),
    ).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => <VerticalFeed posts={testPosts} />);
    flush();

    await expectNoA11yViolations();
  });
});
