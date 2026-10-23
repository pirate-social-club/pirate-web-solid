/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";

import { PublicPostRouteView } from "./public-post-route-view";
import type { PublicPostEngagementDependencies } from "./public-post-engagement";
import type { PostEngagementTransport } from "../post-engagement/post-engagement-api";
import { createMemoryPendingEngagementStorage } from "../post-engagement/post-engagement-pending";
import type { PublicPostRouteState } from "./public-post-route.model";

function contentState(canonical: boolean): PublicPostRouteState {
  const fixture = {
    kind: "content",
    post_id: "post-1",
    content: {
      post: {
        id: "post-1",
        post_type: "text",
        community: "community-story",
        created: 1_790_700_000,
        title: "A searchable title",
        body: "A bounded public description.",
        author_persona: { persona_id: "persona-public-creator", object: "persona", display_name: "Public creator", avatar_ref: null, primary_public_handle: null },
      },
      upvote_count: 0,
      downvote_count: 0,
      comment_count: 0,
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
  args: { engagement: { resolveSession: async () => "anonymous" as const } },
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

export const SongPostMobile: Story = {
  args: { state: songState() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /Play A long song title/u })).toBeInTheDocument();
    await expect(canvas.getByRole("navigation", { name: "Song activities" })).toBeInTheDocument();
    await expect(canvas.queryByRole("list", { name: "Song delivery status" })).toBeNull();
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

/** A signed-in song landing reuses the community card and lays its thread under it. */
export const SongPostComments: Story = {
  args: {
    state: (() => {
      const state = songState();
      if (state.kind !== "content") throw new Error("expected content fixture");
      return { ...state, response: { ...state.response, content: { ...state.response.content, comment_count: 1 } } };
    })(),
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
    await expect(await canvas.findByText("A comment on this song")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Write a comment" })).toBeEnabled();
  },
};

// Paper "Screens/Posts/Post": Harbor Collective, a weekly thread and its comments.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const persona = (id: string, handle: string) => ({ persona_id: id, object: "persona" as const, display_name: handle, avatar_ref: null, primary_public_handle: handle });
const paperComment = (id: string, body: string, author: ReturnType<typeof persona>, minutes: number, replies = 0, parent: string | null = null) => ({
  comment_id: id, parent_comment_id: parent, body, depth: parent === null ? 0 : 1, reply_count: replies,
  status: "published" as const, content_rating: "general" as const, created_at: minutesAgo(minutes), author_persona: author,
});
// Newest first, as the server returns them.
const paperRoots = [
  paperComment("comment-nightowl", "Low Tide on the night bus.", persona("persona-nightowl", "nightowl.8s28"), 12),
  paperComment("comment-wavemaker", "Harbor Lights, every morning this week.", persona("persona-wavemaker", "wavemaker"), 60, 1),
];
const paperReplies = [paperComment("comment-harbor", "Same. The second verse.", persona("persona-harbor", "harbor.8s28"), 40, 0, "comment-wavemaker")];
const paperReadComments: NonNullable<PublicPostEngagementDependencies["readComments"]> = async input => ({
  items: input.parentId === "comment-wavemaker" ? paperReplies : input.parentId === undefined ? paperRoots : [],
  next_cursor: null,
});

function paperState(kind: "text" | "song", membership: "member" | "not_member", commentCount: number): PublicPostRouteState {
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("expected content fixture");
  const content = state.response.content;
  // SAFETY: the story supplies the community preview fields the post page reads.
  const community = JSON.parse(JSON.stringify({
    id: "community-harbor", object: "community_preview", display_name: "Harbor Collective", route_slug: "harbor-collective",
    avatar_ref: null, membership_mode: "open", human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [],
    viewer_membership_status: membership, created: 1_790_000_000,
  })) as NonNullable<typeof content.community>;
  const post = kind === "text"
    ? { ...content.post, community: "community-harbor", post_type: "text" as const, created: Math.floor(Date.now() / 1000) - 2 * 3600,
        title: "Weekly listening thread", body: "What have you had on repeat this week?", author_persona: persona("persona-user", "User 4KQ7M2") }
    : { ...content.post, community: "community-harbor", post_type: "song" as const, created: Math.floor(Date.now() / 1000) - 2 * 3600,
        title: null, song_title: "Harbor Lights", body: "Late-night loop, take two.", author_persona: persona("persona-wavemaker", "wavemaker") };
  return { ...state, response: { ...state.response, content: { ...content, community, post, upvote_count: 18, downvote_count: 0, comment_count: commentCount,
    song_presentation: kind === "song" ? { alignment: "ready", data_registration: "registered" } : null } } };
}

const harborMember = async () => ({ status: "authenticated" as const, userId: "story-account", personas: [{ personaId: "persona-harbor", displayName: "harbor.8s28", avatarRef: null, primaryPublicHandle: "harbor.8s28", communityBinding: { communityId: "community-harbor", bindingSource: "first_membership" as const } }] });
const createComment = fn<PostEngagementTransport["createComment"]>(async () => ({
  submission_id: "story-submission", href: "/comments/story-new", surface: "comment", status: "published", result: { decision: "allow", reason_code: null },
  review_ref: null, created_at: minutesAgo(0), updated_at: minutesAgo(0), published_resource: { kind: "comment", comment_id: "story-new", href: "/comments/story-new" },
}));
const reportComment = fn<PostEngagementTransport["reportComment"]>(async () => ({ report_id: "story-report", case_ref: "story-case", status: "open" }));
const paperTransport: PostEngagementTransport = {
  createComment, reportComment,
  createReply: async () => { throw new Error("Story does not submit replies"); },
  reportPost: async () => ({ report_id: "story-post-report", case_ref: "story-post-case", status: "open" }),
  castVote: async () => ({ post_id: "post-1", value: 1 }),
  clearVote: async () => ({ post_id: "post-1", value: 0 }),
  readModerationCase: async () => { throw new Error("Story does not moderate"); },
  moderateCase: async () => { throw new Error("Story does not moderate"); },
  readSubmission: async () => { throw new Error("Story does not read submissions"); },
};
const paperMember = (): PublicPostEngagementDependencies => ({
  resolveSession: harborMember, readViewerVote: async () => null, readComments: paperReadComments,
  pendingStorage: createMemoryPendingEngagementStorage(), transport: paperTransport,
});

/** Paper 210: phone, a text post as a member, comments with one reply, and the comment box. */
export const PaperPhoneTextMember: Story = {
  args: { state: paperState("text", "member", 3), engagement: paperMember() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The phone header; hidden (not removed) when the story runs wider.
    await expect(canvasElement.querySelector("header")).toHaveTextContent("Harbor Collective");
    await expect(canvas.getByRole("heading", { name: "Weekly listening thread", level: 1 })).toBeInTheDocument();
    await expect(await canvas.findByText("Low Tide on the night bus.")).toBeInTheDocument();
    const thread = within(canvasElement.querySelector<HTMLElement>("[data-comment-thread]")!);
    await userEvent.click(thread.getByRole("button", { name: "View replies" }));
    await expect(await canvas.findByText("Same. The second verse.")).toBeInTheDocument();
    const reply = canvasElement.querySelector<HTMLElement>("[data-comment-id='comment-harbor']")!;
    await expect(within(reply).queryByRole("button", { name: "Reply" })).toBeNull();
    await expect(thread.getAllByRole("button", { name: "Reply" })).toHaveLength(2);
    await expect(canvas.getByRole("textbox", { name: "Write a comment" })).toHaveAttribute("placeholder", "Add a comment");
    await expect(canvas.getByRole("button", { name: "Post comment" })).toBeDisabled();
  },
};

/** Paper 211: phone, a song post with a comment and the comment box; nothing wider than the phone. */
export const PaperPhoneSongMember: Story = {
  args: {
    state: paperState("song", "member", 1),
    engagement: { ...paperMember(), readComments: async () => ({ items: [paperComment("comment-song", "Harbor Lights, every morning this week.", persona("persona-wavemaker", "wavemaker"), 60)], next_cursor: null }) },
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Harbor Lights, every morning this week.")).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Write a comment" })).toBeEnabled();
    const main = canvasElement.querySelector("main")!;
    await expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
  },
};

/** Paper 212: phone, a signed-in visitor reads the thread and is offered Join to comment. */
export const PaperPhoneVisitor: Story = {
  args: {
    state: paperState("text", "not_member", 3),
    engagement: { ...paperMember(), resolveSession: async () => ({ status: "authenticated", userId: "story-visitor", personas: [] }) },
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Low Tide on the night bus.")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Join to comment" })).toHaveAttribute("href", "/c/harbor-collective");
    await expect(canvas.queryByRole("textbox", { name: "Write a comment" })).toBeNull();
  },
};

/** Paper 213: desktop, a text post as a member; the comment box sits directly under the post. */
export const PaperDesktopTextMember: Story = {
  args: { state: paperState("text", "member", 3), engagement: paperMember() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Low Tide on the night bus.")).toBeInTheDocument();
    const bar = canvasElement.querySelector("[data-comment-bar]")!;
    const thread = canvasElement.querySelector("[data-comment-thread]")!;
    await expect(bar.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect(canvasElement.querySelector("[data-post-page-header]")).toHaveTextContent("Harbor Collective");
  },
};

/** The comment box sends once, and a comment's reasons list reports it with one tap. */
export const PostPageCommentAndReport: Story = {
  args: { state: paperState("text", "member", 3), engagement: paperMember() },
  play: async ({ canvasElement }) => {
    createComment.mockClear();
    reportComment.mockClear();
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Low Tide on the night bus.")).toBeInTheDocument();
    const input = canvas.getByRole("textbox", { name: "Write a comment" });
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.type(input, "Harbor Lights on repeat");
    await userEvent.click(canvas.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1));
    await expect(await canvas.findByText("Harbor Lights on repeat")).toBeInTheDocument();
    const row = canvasElement.querySelector<HTMLElement>("[data-comment-id='comment-nightowl']")!;
    await userEvent.click(within(row).getByRole("button", { name: "Comment options" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Report" }));
    await userEvent.click(await page.findByRole("button", { name: "Spam" }));
    await waitFor(() => expect(reportComment).toHaveBeenCalledTimes(1));
    // The reported comment is a new row object, so read the row afresh.
    await waitFor(() => expect(canvasElement.querySelector("[data-comment-id='comment-nightowl']")).toHaveTextContent("Report open"));
    await expect(reportComment).toHaveBeenCalledTimes(1);
  },
};

/** A separately published public reference, never a private attempt or verdict. */
export const VideoWithChoreographyCredit: Story = {
  args: { state: (() => {
    const state=contentState(true);if(state.kind!=="content")throw new Error("Expected content fixture");
    return {...state,response:{...state.response,content:{...state.response.content,
      post:{...state.response.content.post,post_type:"video" as const,title:"A dance video",body:null},
      video:{track:"video" as const,caption:null,caption_dir:null,caption_lang:null,
        soundtrack:{kind:"song_reference" as const,song_reference:{song_post_id:"song-post",song_title:"Song",song_author_persona_id:null},render_mode:"canonical_replace" as const},
        dance_credit:{choreography_id:"public-choreography",revision:1,reference_video_post_id:"reference-post"},
        playback:{status:"pending" as const},thumbnail:{status:"pending" as const},data_registration:"registered" as const,capabilities:{can_post_with_song:false}},
    }}};
  })() },
  play: async ({canvasElement}) => { const canvas=within(canvasElement);await expect(canvas.getByRole("link",{name:"View choreography reference"})).toHaveAttribute("href","/post/reference-post"); },
};
