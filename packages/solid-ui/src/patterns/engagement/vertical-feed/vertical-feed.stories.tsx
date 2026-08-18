import { omit } from "solid-js";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { Type } from "@/components/data-display/type/type";
import { brokenPost, fixturePosts, longCaptionPost } from "./fixtures";
import type { MediaPostData } from "./types";
import { VerticalFeed, type VerticalFeedProps } from "./vertical-feed";

const meta = {
  title: "Patterns/Engagement/VerticalFeed",
  component: VerticalFeed,
  tags: ["autodocs"],
  args: {
    posts: fixturePosts,
    onActivePostChange: fn(),
    onEndReached: fn(),
    onLikeClick: fn(),
    onShareClick: fn(),
    onFollowClick: fn(),
    onAuthorClick: fn(),
    onSoundtrackClick: fn(),
    onMuteToggle: fn(),
    onViewed: fn(),
    onHaptic: fn(),
  },
  argTypes: {
    posts: { control: "object" },
    class: { table: { disable: true } },
    onActivePostChange: { table: { disable: true } },
    onEndReached: { table: { disable: true } },
    onLikeClick: { table: { disable: true } },
    onShareClick: { table: { disable: true } },
    onFollowClick: { table: { disable: true } },
    onAuthorClick: { table: { disable: true } },
    onSoundtrackClick: { table: { disable: true } },
    onMuteToggle: { table: { disable: true } },
    onViewed: { table: { disable: true } },
    onHaptic: { table: { disable: true } },
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full-screen, snap-scrolling vertical media feed (the TikTok-style pattern). Feed it plain MediaPostData; it autoplays the active post behind the browser's first-interaction gate, supports scroll and ArrowUp/ArrowDown navigation, and reports every intent (like, share, follow, author, soundtrack, mute, view, end-of-feed) through callbacks. Action controls hide when their callback is absent, except mute (local playback state). Use it for immersive media browsing surfaces. Do not use it for mixed-content or text-heavy feeds, and do not expect it to route, notify, or fetch: the host app owns all side effects. Mobile overlay insets read the host-defined CSS variable --safe-area-bottom (typically set to env(safe-area-inset-bottom) plus any tab-bar offset); it falls back to 0px when the host does not define it.",
      },
    },
  },
} satisfies Meta<typeof VerticalFeed>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Interactive wrapper that owns like state, like a host app would. */
function InteractiveFeed(props: VerticalFeedProps) {
  const [posts, setPosts] = createSignal<MediaPostData[]>(props.posts);
  const rest = omit(props, "posts", "onLikeClick");

  const handleLike = (postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              isLiked: !post.isLiked,
              likeCount: post.isLiked ? post.likeCount - 1 : post.likeCount + 1,
            }
          : post,
      ),
    );
    props.onLikeClick?.(postId);
  };

  return <VerticalFeed {...rest} posts={posts()} onLikeClick={handleLike} />;
}

export const Default: Story = {
  render: (args) => <InteractiveFeed {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const region = canvas.getByRole("region", { name: "Media feed" });
    await expect(region).toBeVisible();
    await expect(canvas.getAllByText("@wavemaker").length).toBeGreaterThan(0);

    // Like toggles through the callback and updates the visible state.
    const likeButton = canvas.getAllByRole("button", { name: "Like video" })[0];
    await userEvent.click(likeButton);
    await expect(args.onLikeClick).toHaveBeenCalledWith("post-1");
    await waitFor(async () => {
      await expect(
        canvas.getAllByRole("button", { name: "Unlike video" })[0],
      ).toHaveAttribute("aria-pressed", "true");
    });

    // Keyboard navigation advances the active post.
    region.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(args.onActivePostChange).toHaveBeenCalledWith("post-2", 1),
    );
    await userEvent.keyboard("{ArrowUp}");
    await waitFor(() =>
      expect(args.onActivePostChange).toHaveBeenCalledWith("post-1", 0),
    );
  },
};

export const Empty: Story = {
  args: {
    posts: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No posts to show")).toBeVisible();
  },
};

export const Loading: Story = {
  args: {
    posts: fixturePosts.slice(0, 2),
    loading: true,
    hasMore: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("status", { name: "Loading more posts" }),
    ).toBeVisible();
  },
};

export const Error: Story = {
  args: {
    posts: [brokenPost],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Playback error")).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    posts: [longCaptionPost],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByText(/deliberately long caption/)[0],
    ).toBeVisible();
  },
};

export const Mobile: Story = {
  args: {
    hasMobileFooter: true,
  },
  // Storybook 10 core viewport: mobile1 = Small mobile (320x568), provided by
  // MINIMAL_VIEWPORTS by default; no addon package required.
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: (args) => (
    <div class="relative">
      <InteractiveFeed {...args} />
      {/* Simulated host-app tab bar the overlays must clear */}
      <div class="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-border bg-background/90">
        <Type as="span" variant="caption">Home</Type>
        <Type as="span" variant="caption">Search</Type>
        <Type as="span" variant="caption">Activity</Type>
        <Type as="span" variant="caption">Profile</Type>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("button", { name: "Follow wavemaker" })[0],
    ).toBeVisible();
  },
};
