/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";

import { activityRewardsFixture, noActivityRewardsFixture } from "./song-activities.fixtures.ts";
import { expectFitsViewport } from "../../../stories/viewport-story-helpers";
import { PublicPostRouteView } from "./public-post-route-view";
import { createMemoryPendingEngagementStorage } from "../post-engagement/post-engagement-pending";
import type { PublicPostRouteState } from "./public-post-route.model";

function contentState(canonical: boolean): PublicPostRouteState {
  const fixture = {
    kind: "content",
    post_id: "post-1",
    content: {
      post: {
        id: "post-1",
        title: "A searchable title",
        body: "A bounded public description.",
        author_persona: { display_name: "Public creator", primary_public_handle: null },
      },
      resolved_locale: "en",
      translation_state: "same_language",
      translated_title: null,
      translated_body: null,
    },
    route: canonical ? {
      canonical_path: "/posts/a-searchable-title",
      activity_paths: {
        study: "/posts/a-searchable-title/study",
        karaoke: "/posts/a-searchable-title/karaoke",
        karaoke_leaderboard: "/posts/a-searchable-title/karaoke/leaderboard",
      },
    } : null,
  };
  // SAFETY: the story fixture supplies every field read by the component; wire
  // completeness belongs to generated-client transport tests.
  const response = JSON.parse(JSON.stringify(fixture)) as Extract<
    GetPublicPostsBySlugResponse,
    { kind: "content" }
  >;
  return {
    kind: "content",
    status: 200,
    activity: "detail",
    response,
    canonicalPath: canonical ? "/posts/a-searchable-title" : null,
    canonicalUrl: canonical ? "https://pirate.sc/posts/a-searchable-title" : null,
  };
}

const translatedState = (): PublicPostRouteState => {
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("expected content fixture");
  return {
    ...state,
    response: {
      ...state.response,
      content: {
        ...state.response.content,
        translation_state: "ready",
        translated_title: "Ein durchsuchbarer Titel",
        translated_body: "Eine begrenzte öffentliche Beschreibung.",
      },
    },
  };
};

const songState = (): PublicPostRouteState => {
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("expected content fixture");
  return {
    ...state,
    response: {
      ...state.response,
      content: {
        ...state.response.content,
        post: {
          ...state.response.content.post,
          post_type: "song",
          community: "community-story",
          created: 1_790_700_000,
          title: "A long song title that still fits on a narrow phone without widening the page",
          song_title: "A long song title that still fits on a narrow phone without widening the page",
        },
        song_presentation: { alignment: "ready", data_registration: "registered" },
      },
    },
  };
};

const meta = {
  title: "Screens/Posts/PublicPostRoute",
  component: PublicPostRouteView,
  args: { engagement: { resolveSession: async () => "anonymous" as const }, activities: { readRewards: async () => noActivityRewardsFixture, readVideoEligibility: async () => true, navigate: () => undefined } },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof PublicPostRouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The route view while the content promise is in flight. */
export const Loading: Story = {
  args: { state: new Promise<PublicPostRouteState>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status", { name: "Loading post" })).toBeInTheDocument();
  },
};

/** A canonical public post with title, author, body, and Open Graph metadata. */
export const Detail: Story = {
  args: { state: contentState(true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "A searchable title", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByText("Public creator")).toBeInTheDocument();
    await expect(canvas.getByText("A bounded public description.")).toBeInTheDocument();
    await expect(canvasElement.querySelector("main")?.getAttribute("data-public-post-state")).toBe("content");
  },
};

export const SongPostMobile: Story = {
  args: { state: songState() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Play A long song title/u })).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Activities" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Sign in to/u })).toBeNull();
    await expect(canvas.queryByRole("navigation", { name: "Song activities" })).toBeNull();
    await expect(canvas.queryByRole("list", { name: "Song delivery status" })).toBeNull();
    await expectFitsViewport(canvasElement);
  },
};

/** A machine-translated post renders the translated title and body. */
export const Translated: Story = {
  args: { state: translatedState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Ein durchsuchbarer Titel", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByText("Eine begrenzte öffentliche Beschreibung.")).toBeInTheDocument();
  },
};

/** A guarded post renders its content but noindex, without canonical metadata. */
export const Guarded: Story = {
  args: { state: contentState(false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "A searchable title", level: 1 })).toBeInTheDocument();
    await expect(document.head.querySelector("meta[name='robots']")?.getAttribute("content")).toBe("noindex, nofollow");
    await expect(document.head.querySelector("link[rel='canonical']")).toBeNull();
  },
};

/** An age-locked post shows only the verification notice, never the content. */
export const AgeLocked: Story = {
  args: {
    state: {
      kind: "age-locked",
      status: 200,
      activity: "detail",
      locked: {
        kind: "age_locked",
        content_rating: "adult_18",
        next_action: { kind: "verify_minimum_age", minimum_age: 18 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Age verification required", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByText("This content is available after proving you are 18 or older.")).toBeInTheDocument();
    await expect(canvas.queryByText("A searchable title")).toBeNull();
    await expect(canvasElement.querySelector("main")?.getAttribute("data-public-post-state")).toBe("age-locked");
  },
};

/** A 308 legacy address renders the unavailable shell; the route performs the redirect. */
export const LegacyRedirect: Story = {
  args: { state: { kind: "redirect", status: 308, location: "/posts/a-searchable-title" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Post unavailable", level: 1 })).toBeInTheDocument();
    await expect(canvasElement.querySelector("main")?.getAttribute("data-public-post-state")).toBe("redirect");
  },
};

export const NotFound: Story = {
  args: { state: { kind: "not-found", status: 404 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This post is not available.");
  },
};

export const Invalid: Story = {
  args: { state: { kind: "invalid", status: 400 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This post address is invalid.");
  },
};

export const MethodNotAllowed: Story = {
  args: { state: { kind: "method-not-allowed", status: 405 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This post route is read-only.");
  },
};

export const Unavailable: Story = {
  args: { state: { kind: "unavailable", status: 502 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This post could not be loaded.");
  },
};

export const Mobile: Story = {
  args: { state: contentState(true) },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** A signed-in song landing reuses the community card and persisted comment panel. */
export const SongPostComments: Story = {
  args: {
    state: songState(),
    engagement: {
      resolveSession: async () => ({ status: "authenticated", userId: "story-account", personas: [{ personaId: "story-profile", displayName: "Your profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community-story", bindingSource: "first_membership" } }] }),
      readViewerVote: async () => null,
      pendingStorage: createMemoryPendingEngagementStorage(),
      readComments: async () => ({ items: [{ comment_id: "story-comment", parent_comment_id: null, body: "A comment on this song", depth: 0, reply_count: 0, status: "published", content_rating: "general", created_at: "2026-09-29T00:00:00Z", author_persona: null }], next_cursor: null }),
    },
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Comments (0)" }));
    const page = within(document.body);
    await expect(await page.findByText("A comment on this song")).toBeInTheDocument();
    await expect(page.getByRole("textbox", { name: "Write a comment" })).toBeEnabled();
  },
};

/** URLs and identifiers must wrap even when they contain no spaces. */
export const LongTextMobile: Story = {
  args: { state: (() => {
    const state = contentState(true);
    if (state.kind !== "content") throw new Error("expected content fixture");
    return { ...state, response: { ...state.response, content: { ...state.response.content,
      post: { ...state.response.content.post, post_type: "text", title: "LongTitle".repeat(30), body: "https://example.com/" + "long-path".repeat(40) },
    } } };
  })() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => { await expectFitsViewport(canvasElement); },
};

export const SongPostSignedOutDesktop: Story = {
  ...SongPostMobile,
  globals: { viewport: { value: "reset", isRotated: false } },
};

export const SongPostSignedIn: Story = {
  args: { state: songState(), engagement: {
    resolveSession: async () => ({ status: "authenticated", userId: "song-story-viewer", personas: [] }),
    readViewerVote: async () => null,
    pendingStorage: createMemoryPendingEngagementStorage(),
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Activities" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /Sign in to/u })).toBeNull();
    await expectFitsViewport(canvasElement);
  },
};

/** The single activity pill opens a bottom sheet on phones and a dialog on desktop. */
export const SongActivitiesMobile: Story = {
  args: { state: songState() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Activities" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Activities" })).toBeInTheDocument();
    await expect(page.getByRole("button", { name: "Study" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Sing" })).toBeEnabled();
    await expect(await page.findByRole("button", { name: "Use this song" })).toBeEnabled();
    await expectFitsViewport(canvasElement);
  },
};
export const SongActivitiesDesktop: Story = { ...SongActivitiesMobile, globals: { viewport: { value: "reset", isRotated: false } } };

export const SongActivitiesRewardsMobile: Story = {
  args: { state: songState(), activities: { readRewards: async () => activityRewardsFixture, readVideoEligibility: async () => true } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Activities · rewards available" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText("2.5 USDC bonus")).toBeInTheDocument();
    await expect(page.getByText("Megapot · chance to win")).toBeInTheDocument();
    await userEvent.click(page.getByText("Megapot · chance to win"));
    await expect(page.getByText(/This funds tickets, not a guaranteed payout/u)).toBeVisible();
    await expectFitsViewport(canvasElement);
  },
};
export const SongActivitiesRewardsDesktop: Story = { ...SongActivitiesRewardsMobile, globals: { viewport: { value: "reset", isRotated: false } } };
export const SongActivitiesRewardsUnavailable: Story = {
  ...SongActivitiesMobile,
  args: { state: songState(), activities: { readRewards: async () => { throw new Error("offline"); }, readVideoEligibility: async () => false } },
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Activities" }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText(/Rewards could not be checked/u)).toBeInTheDocument();
    await expect(page.getByRole("button", { name: "Study" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Sing" })).toBeEnabled();
  },
};
