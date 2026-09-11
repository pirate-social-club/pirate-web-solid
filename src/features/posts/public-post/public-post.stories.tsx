/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";

import { PublicPostRouteView } from "./public-post-route-view";
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

const meta = {
  title: "Screens/Posts/PublicPostRoute",
  component: PublicPostRouteView,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof PublicPostRouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The route view while the content promise is in flight. */
export const Loading: Story = {
  args: { state: new Promise<PublicPostRouteState>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Loading post" })).toBeInTheDocument();
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
    await expect(canvas.getByText("This post is available after verifying that you are at least 18.")).toBeInTheDocument();
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
