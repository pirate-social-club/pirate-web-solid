/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Show, createSignal, untrack } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { clearSession, type AuthenticatedSession } from "../../../api/session.ts";
import { Button } from "../../../design-system";
import type { CommunityPost } from "../../community/page-shell/page-shell-model.ts";
import type { PendingSubmissionEnvelopeV1 } from "../../posts/post-composer/pending-submission.ts";
import type { TextContentSubmissionV1 } from "../../posts/post-composer/text-submission-contract.ts";
import {
  AmbiguousTextSubmissionError,
  TextSubmissionAuthenticationRequiredError,
  TextSubmissionServerRejectionError,
  type TextSubmissionTransport,
} from "../../posts/post-composer/text-submission-transport.ts";
import type { MediaSubmissionSnapshot } from "../../posts/media-submission/contracts.ts";
import type { MediaSubmissionTransport } from "../../posts/media-submission/transport.ts";
import { SONG_STAGES } from "../../posts/song-submission/pending-songs.tsx";
import { createSongSubmissionStore, SongSubmissionProvider } from "../../posts/song-submission/song-submission-store.tsx";
import { TextSubmissionProvider } from "../../posts/text-submission/text-submission-store.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import { CommunityPage, type CommunityPageProps } from "./community-page";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import type { CommunityPageSuccess } from "./community-page.model";
import type { CommunityViewerVoteClient } from "./community-viewer-vote-api.ts";
import { ActivePersonaProvider } from "../../identity/active-persona-store.tsx";
import { ApplicationChrome } from "../../shell/media-shell/media-shell.tsx";
import { createHeldSongUploadTransport } from "./song-upload-story-fixtures";

const communityId = "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345";

const data: CommunityPageSuccess = {
  kind: "success",
  status: 200,
  requestedPathSegment: "night-shift",
  canonicalPath: "/c/night-shift",
  canonicalUrl: "https://pirate.sc/c/night-shift",
  communityId,
  routeFamily: "hns",
  routeDisplay: "night-shift",
  community: {
    displayName: "Night Shift",
    description: "A late-night space for music, ideas, and people building after dark.",
    membershipMode: "open",
    memberCount: 1_270,
    followerCount: 18_400,
    rules: [{ title: "Keep posts on topic", body: "Memes belong in the weekly thread." }],
  },
};

const existingPost: CommunityPost = {
  id: "tour-arrangement",
  title: "What is the best live arrangement?",
  body: "The live arrangement left more room for the final chorus.",
  score: 42,
  publishedAt: "2026-08-27T10:00:00.000Z",
  authorHandle: "currents.pirate",
  commentCount: 8,
};

const memberSession: AuthenticatedSession = {
  status: "authenticated",
  userId: "storybook-account",
  personas: [{
    personaId: "storybook-persona",
    displayName: "Harbor",
    avatarRef: null,
    primaryPublicHandle: null,
    communityBinding: { communityId, bindingSource: "first_membership" },
  }],
};

const memberEngagement: CommunityEngagementApi = {
  readViewerState: async () => ({ membership: "member", following: true, followerCount: 18_400 }),
  resolveJoinAction: async () => ({ kind: "join" }),
  join: async () => ({ status: "joined", personaId: "storybook-persona" }),
  follow: async () => ({ following: true, followerCount: 18_400 }),
  unfollow: async () => ({ following: false, followerCount: 18_399 }),
};

/** The viewer has voted on nothing. The reader uses only the post id and the vote. */
const noVotes: CommunityViewerVoteClient = {
  get_postsPostId: async (input) => JSON.parse(JSON.stringify({ post: { id: input.path.postId }, viewer_vote: null })),
};

function bodyOf(envelope: PendingSubmissionEnvelopeV1): { readonly title: string | null; readonly body: string } {
  const text = atob(envelope.body_utf8_base64url.replace(/-/gu, "+").replace(/_/gu, "/"));
  // SAFETY: the envelope was built by the store from a text post request,
  // whose serialized body always carries these two fields.
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(text, char => char.charCodeAt(0)))) as { title: string | null; body: string };
}

/**
 * A stand-in server. It keeps what it accepted so the feed read returns the
 * post, and it answers the same key with the same result, as the real one does.
 */
function standInServer(behaviour: {
  /** Attempts whose acknowledgement is lost after the server accepted them. */
  readonly lostAcknowledgements?: number;
  /** While true no request reaches the server at all. */
  readonly offline?: () => boolean;
  readonly refuse?: boolean;
  readonly holdMs?: number;
  /** While true the server accepts posts but none of its answers arrive. */
  readonly answersLost?: () => boolean;
  /** While false the server answers that the session is not signed in. */
  readonly signedIn?: () => boolean;
} = {}) {
  const published = new Map<string, TextContentSubmissionV1>();
  const posts: CommunityPost[] = [existingPost];
  let lost = behaviour.lostAcknowledgements ?? 0;
  const transport: TextSubmissionTransport = {
    read: async () => null,
    dispatch: async (envelope) => {
      if (behaviour.holdMs) await new Promise(resolve => setTimeout(resolve, behaviour.holdMs));
      if (behaviour.offline?.()) throw new AmbiguousTextSubmissionError("offline");
      if (behaviour.signedIn?.() === false) throw new TextSubmissionAuthenticationRequiredError();
      if (behaviour.refuse) throw new TextSubmissionServerRejectionError(403, "membership_required");
      let snapshot = published.get(envelope.idempotency_key);
      if (snapshot === undefined) {
        const request = bodyOf(envelope);
        const postId = `post-${published.size + 1}`;
        snapshot = {
          submission_id: `submission-${published.size + 1}`,
          href: `/text-content-submissions/submission-${published.size + 1}`,
          surface: "text_post",
          status: "published",
          result: { decision: "allow", reason_code: null },
          published_resource: { kind: "post", post_id: postId, href: `/posts/${postId}` },
          review_ref: null,
          created_at: "2026-10-06T00:00:00Z",
          updated_at: "2026-10-06T00:00:00Z",
        };
        published.set(envelope.idempotency_key, snapshot);
        posts.push({
          id: postId,
          title: request.title ?? "",
          body: request.body,
          score: 0,
          publishedAt: new Date().toISOString(),
          authorHandle: "Harbor",
          commentCount: 0,
        });
      }
      if (lost > 0 || behaviour.answersLost?.()) {
        lost = Math.max(0, lost - 1);
        throw new AmbiguousTextSubmissionError("acknowledgement lost");
      }
      return snapshot;
    },
  };
  return {
    transport,
    loadThreads: async () => ({ posts: [...posts], nextCursor: null }),
    publishedCount: () => published.size,
  };
}

function pageArgs(server: ReturnType<typeof standInServer>) {
  return {
    pathSegment: "night-shift",
    data,
    surfaceData: { posts: [existingPost] },
    engagementApi: memberEngagement,
    loadThreads: server.loadThreads,
    resolveSession: async () => memberSession,
    resolveOwnerSettingsAccess: async () => false,
    handleSalesClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) },
    viewerVoteClient: noVotes,
    textSubmissionTransport: server.transport,
  };
}

function SongPostingPreview(props: CommunityPageProps) {
  const server = createHeldSongUploadTransport();
  const transport: MediaSubmissionTransport = {
    ...server.transport,
    dispatch: async command => {
      if (command.kind === "terms" || command.kind === "lyrics") {
        const snapshot = await server.transport.read("upload-progress-song");
        if (snapshot === null) throw new Error("Song preview snapshot is unavailable");
        return snapshot;
      }
      return server.transport.dispatch(command);
    },
    upload: async (reservation, audio, onProgress, signal) => {
      const uploading = server.transport.upload(reservation, audio, onProgress, signal);
      server.finish();
      await uploading;
    },
  };
  return <CommunityPage {...props} mediaSubmissionTransport={transport} />;
}

const meta = {
  title: "Screens/Community/CommunityPage/Posting",
  component: CommunityPage,
  args: { pathSegment: "night-shift" },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openComposer(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Post" }));
  return within(await canvas.findByRole("form", { name: "Create a post" }));
}

async function writeAndPost(canvasElement: HTMLElement, text: string) {
  const form = await openComposer(canvasElement);
  await userEvent.type(form.getByRole("textbox", { name: "Post" }), text);
  await userEvent.click(form.getByRole("button", { name: "Post" }));
}

const pending = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>("[data-pending-text-post]");

/** The actual page transition, left open for visual review. */
export const ComposerReplacesTheFeed: Story = {
  name: "Desktop full-width post form",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(existingPost.title)).toBeVisible();
    await openComposer(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>("[data-text-post-panel]")!;
    const main = canvas.getByRole("main", { name: "Create a post" });
    await waitFor(() => {
      expect(panel.closest("main")).toBe(main);
      expect(panel.closest("aside")).toBeNull();
      expect(Math.abs(panel.getBoundingClientRect().width - main.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    });
    await expect(canvas.queryByText(existingPost.title)).toBeNull();
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(canvas.queryByText("Feed", { selector: "button" })).toBeNull();
    await expect(canvas.getByRole("complementary", { name: "Community information" })).toBeVisible();
  },
};

/**
 * The phone presentation recorded in
 * tasks/records/solid-composer-mobile-flat-surface.md, asserted as intent and
 * not only as fit: writing is the whole screen, flat, under the 2026-09-24
 * action bar, with nothing pushing the fields down and no footer.
 */
async function expectFlatPhoneComposer(canvasElement: HTMLElement, firstField: HTMLElement) {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView!;
  // The phone viewport is applied after the first render.
  await waitFor(() => expect(view.matchMedia("(max-width: 767px)").matches).toBe(true));
  const bar = await waitFor(() => {
    const found = canvasElement.querySelector<HTMLElement>("[data-composer-sticky-header]");
    expect(found).not.toBeNull();
    return found!;
  });
  await waitFor(() => {
    // The banner and community header give way while composing.
    const chrome = canvasElement.querySelector<HTMLElement>("[data-community-chrome]")!;
    expect(chrome.getBoundingClientRect().height).toBe(0);
    expect(within(canvasElement).queryByRole("heading", { level: 1 })).toBeNull();
    // Flat: nothing between the form and the page is a card, and there is
    // no "Create a post" heading.
    const form = firstField.closest("form")!;
    for (let node = form.parentElement; node && node.tagName !== "MAIN"; node = node.parentElement) {
      expect(node.className).not.toMatch(/bg-card|shadow/u);
    }
    expect(form.className).not.toMatch(/bg-card|shadow|border/u);
    expect(within(canvasElement).queryByRole("heading", { name: "Create a post" })).toBeNull();
    // The first field is near the top of the screen.
    expect(firstField.getBoundingClientRect().top).toBeLessThanOrEqual(150);
    // The actions are in the bar above the fields, not in a footer.
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(firstField.getBoundingClientRect().top);
    expect(within(bar).getByRole("button", { name: "Close composer" })).toBeVisible();
    expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth);
  });
  return bar;
}

/** Scrolled to the very bottom, the action bar is still on screen. */
async function expectBarStaysOnScreen(canvasElement: HTMLElement, bar: HTMLElement) {
  const view = canvasElement.ownerDocument.defaultView!;
  view.scrollTo({ top: canvasElement.ownerDocument.documentElement.scrollHeight });
  await waitFor(() => {
    expect(view.scrollY).toBeGreaterThan(0);
    const box = bar.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual(view.innerHeight);
  });
  view.scrollTo({ top: 0 });
}

/** A long post, so the page has to scroll. */
const longPost = Array.from({ length: 40 }, (_, line) => `Line ${line + 1} of a long post.`).join("\n");

/** Phone: a flat surface under the September action bar. */
export const FullWidthComposerOnMobile: Story = {
  name: "Mobile flat post form",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const form = await openComposer(canvasElement);
    const title = form.getByRole("textbox", { name: "Title" });
    const body = form.getByRole("textbox", { name: "Post" });
    const bar = await expectFlatPhoneComposer(canvasElement, title);
    await expect(within(bar).getByRole("button", { name: "Post" })).toBeDisabled();
    // Song and Video are a plain row directly under the text field.
    const song = form.getByRole("button", { name: "Post a song" });
    const video = form.getByRole("button", { name: "Post a video" });
    await expect(song.getBoundingClientRect().top).toBeGreaterThanOrEqual(body.getBoundingClientRect().bottom);
    await expect(Math.abs(song.getBoundingClientRect().top - video.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    // There is no second Post button below the fields.
    await expect(form.getAllByRole("button", { name: "Post" })).toHaveLength(1);
    await userEvent.click(body);
    await userEvent.paste(longPost);
    await expect(within(bar).getByRole("button", { name: "Post" })).toBeEnabled();
    await expectBarStaysOnScreen(canvasElement, bar);
    await expect(within(canvasElement).queryByText(existingPost.title)).toBeNull();
  },
};

/** Phone: Back ends composing like Close, and the draft is kept. */
export const MobileBackKeepsTheDraft: Story = {
  name: "Mobile Back closes the form and keeps the draft",
  args: pageArgs(standInServer()),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView!;
    const form = await openComposer(canvasElement);
    await userEvent.type(form.getByRole("textbox", { name: "Post" }), "Kept through Back");
    view.history.back();
    await waitFor(() => expect(within(canvasElement).queryByRole("form", { name: "Create a post" })).toBeNull());
    await expect(await within(canvasElement).findByText(existingPost.title)).toBeVisible();
    const reopened = await openComposer(canvasElement);
    await expect(reopened.getByRole("textbox", { name: "Post" })).toHaveValue("Kept through Back");
    // Close the second time with the bar's own control: Back is not then
    // spent on a history entry that no longer has a composer behind it.
    await userEvent.click(reopened.getByRole("button", { name: "Close composer" }));
    await waitFor(() => expect(within(canvasElement).queryByRole("form", { name: "Create a post" })).toBeNull());
  },
};

/** Phone, inside the real application shell: its bottom navigation gives way. */
export const MobileComposerInsideTheAppShell: Story = {
  name: "Mobile composer inside the app shell",
  args: pageArgs(standInServer()),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: args => (
    <ActivePersonaProvider>
      <ApplicationChrome currentPath="/c/night-shift" hideMobileHeader mobileActiveItem="none" mode="standard" signedIn>
        <CommunityPage {...args} />
      </ApplicationChrome>
    </ActivePersonaProvider>
  ),
  play: async ({ canvasElement }) => {
    const footer = await waitFor(() => {
      const found = canvasElement.ownerDocument.querySelector<HTMLElement>("nav[aria-label='Primary navigation']");
      expect(found).not.toBeNull();
      expect(found!.getBoundingClientRect().height).toBeGreaterThan(0);
      return found!;
    });
    const form = await openComposer(canvasElement);
    const bar = await expectFlatPhoneComposer(canvasElement, form.getByRole("textbox", { name: "Title" }));
    await waitFor(() => expect(footer.getBoundingClientRect().height).toBe(0));
    await userEvent.click(form.getByRole("textbox", { name: "Post" }));
    await userEvent.paste(longPost);
    await expectBarStaysOnScreen(canvasElement, bar);
    await userEvent.click(within(bar).getByRole("button", { name: "Close composer" }));
    await waitFor(() => expect(footer.getBoundingClientRect().height).toBeGreaterThan(0));
  },
};

export const CancelKeepsTheDraft: Story = {
  name: "Cancel returns to the feed and keeps the draft",
  args: pageArgs(standInServer()),
  play: async ({ canvasElement }) => {
    const form = await openComposer(canvasElement);
    await userEvent.type(form.getByRole("textbox", { name: "Title" }), "A draft title");
    await userEvent.type(form.getByRole("textbox", { name: "Post" }), "A draft to return to");
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
    await expect(await within(canvasElement).findByText(existingPost.title)).toBeVisible();
    await expect(within(canvasElement).queryByRole("form", { name: "Create a post" })).toBeNull();
    const reopened = await openComposer(canvasElement);
    await expect(reopened.getByRole("textbox", { name: "Title" })).toHaveValue("A draft title");
    await expect(reopened.getByRole("textbox", { name: "Post" })).toHaveValue("A draft to return to");
  },
};

async function openSongInMain(canvasElement: HTMLElement) {
  await openComposer(canvasElement);
  const canvas = within(canvasElement);
  await userEvent.upload(canvas.getByLabelText("Choose a song file"),
    new File([new Uint8Array(100)], "midnight-waves.mp3", { type: "audio/mpeg" }));
  // Desktop names the step with a heading; a phone leaves the bar's centre
  // empty and names nothing, as decided on 2026-09-24.
  const form = await canvas.findByRole("form", { name: "Post a song" });
  const main = canvas.getByRole("main", { name: "Create a post" });
  await waitFor(() => {
    expect(form.closest("main")).toBe(main);
    expect(form.closest("aside")).toBeNull();
    expect(canvasElement.ownerDocument.defaultView!.getComputedStyle(form).position).toBe("static");
    expect(Math.abs(form.getBoundingClientRect().width - main.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(canvasElement.ownerDocument.defaultView!.innerWidth);
  });
  await expect(canvas.queryByText(existingPost.title)).toBeNull();
  await expect(canvas.queryByRole("dialog")).toBeNull();
  await expect(canvas.queryByText("18+ only")).toBeNull();
  return canvas;
}

export const SongComposerInMain: Story = {
  name: "Song stays in the main post form",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  play: async ({ canvasElement }) => { await openSongInMain(canvasElement); },
};

export const SongComposerInMainOnMobile: Story = {
  name: "Mobile song steps on the flat surface",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = await openSongInMain(canvasElement);
    const audio = canvas.getByRole("button", { name: "Remove audio" });
    const bar = await expectFlatPhoneComposer(canvasElement, audio);
    // Forward is the bar's right-hand control; there is no footer.
    await expect(within(bar).getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(canvas.getAllByRole("button", { name: "Continue" })).toHaveLength(1);
    await userEvent.click(canvas.getByRole("textbox", { name: /Lyrics/u }));
    await userEvent.paste(longPost);
    await expectBarStaysOnScreen(canvasElement, bar);
  },
};

export const SongStepsReturnToFeed: Story = {
  name: "Song, Royalties and Review stay in the form, then return to feed",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openSongInMain(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await canvas.findByRole("heading", { name: "Royalties" });
    await expect(canvas.getByRole("form", { name: "Post a song" }).closest("main")).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await canvas.findByRole("heading", { name: "Review" });
    await expect(canvas.getByRole("form", { name: "Post a song" }).closest("main")).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Post song" }));
    await waitFor(() => expect(canvas.queryByRole("form", { name: "Post a song" })).toBeNull());
    await expect(canvas.getByRole("main", { name: "Community feed" })).toBeVisible();
    await expect(canvasElement.querySelectorAll("[data-pending-song]")).toHaveLength(1);
  },
};

export const SongStepsReturnToFeedOnMobile: Story = {
  name: "Mobile song steps move through the bar, then return to feed",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = await openSongInMain(canvasElement);
    const bar = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-sticky-header]")!);
    await waitFor(() => expect(bar().getByRole("button", { name: "Continue" })).toBeEnabled());
    await userEvent.click(bar().getByRole("button", { name: "Continue" }));
    // Royalties: back on the left, forward on the right.
    await waitFor(() => expect(bar().getByRole("button", { name: "Back" })).toBeVisible());
    await expect(canvas.getByText(/earnings/iu)).toBeVisible();
    await waitFor(() => expect(bar().getByRole("button", { name: "Continue" })).toBeEnabled());
    await userEvent.click(bar().getByRole("button", { name: "Continue" }));
    // Review: the right-hand control publishes.
    const publish = await waitFor(() => bar().getByRole("button", { name: "Post song" }));
    await expect(canvas.getAllByRole("button", { name: "Post song" })).toHaveLength(1);
    await userEvent.click(publish);
    await waitFor(() => expect(canvas.queryByRole("form", { name: "Post a song" })).toBeNull());
    await expect(canvas.getByRole("main", { name: "Community feed" })).toBeVisible();
    await expect(canvasElement.querySelectorAll("[data-pending-song]")).toHaveLength(1);
  },
};

const heldSongUpload = createHeldSongUploadTransport();

/**
 * Back while the song's audio is still uploading. The song's own guard keeps
 * the steps open, exactly as its close button does, and Back stays available
 * for when the upload has finished.
 */
export const MobileBackRespectsTheSongGuard: Story = {
  name: "Mobile Back does not abandon an uploading song",
  args: { ...pageArgs(standInServer()), mediaSubmissionTransport: heldSongUpload.transport },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView!;
    const canvas = await openSongInMain(canvasElement);
    const bar = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-sticky-header]")!);
    await waitFor(() => expect(bar().getByRole("button", { name: "Continue" })).toBeEnabled());
    // Continue starts the upload, which the stand-in server holds open.
    await userEvent.click(bar().getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(canvasElement.querySelector("[data-media-composer-state='uploading']")).not.toBeNull());
    view.history.back();
    await waitFor(() => expect(canvas.getByText(/unresolved command/iu)).toBeVisible());
    await expect(canvas.getByRole("form", { name: "Post a song" })).toBeVisible();
    // The history entry is back in place, so a later Back still closes.
    await waitFor(() => expect(view.history.state?.pirateComposer).toBe(true));
    heldSongUpload.finish();
    await waitFor(() => expect(canvasElement.querySelector("[data-media-composer-state='uploading']")).toBeNull());
  },
};

/** The post appears at once and is then replaced by the published post. */
export const PostsInstantly: Story = {
  name: "Posted and confirmed",
  args: pageArgs(standInServer({ holdMs: 600 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Hello world");
    // Visible straight away, with the composer already gone.
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "sending"));
    await expect(pending(canvasElement)!).toHaveTextContent("Hello world");
    await expect(canvas.queryByRole("form", { name: "Create a post" })).toBeNull();
    // Confirmed: the real post takes its place first in the feed, once.
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 5_000 });
    const posts = canvasElement.querySelectorAll("[data-community-post]");
    await expect(posts[0]).toHaveTextContent("Hello world");
    await expect(canvas.getAllByText("Hello world")).toHaveLength(1);
  },
};

/** The server accepted the post but its answer never arrived. */
const lostAcknowledgementServer = standInServer({ lostAcknowledgements: 1 });

export const LostAcknowledgement: Story = {
  name: "Lost acknowledgement, then confirmed",
  args: pageArgs(lostAcknowledgementServer),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const before = lostAcknowledgementServer.publishedCount();
    await writeAndPost(canvasElement, "Did this arrive?");
    await waitFor(() => expect(pending(canvasElement)).not.toBeNull());
    // Nothing asks the author to check, and nothing calls it failed.
    await expect(canvas.queryByText(/check again/iu)).toBeNull();
    await expect(canvas.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 6_000 });
    // The replay confirmed the first post instead of making a second one.
    await expect(lostAcknowledgementServer.publishedCount() - before).toBe(1);
  },
};

let connectionDown = true;

/** No connection: one plain message on the pending post, then recovery. */
export const ConnectionLost: Story = {
  name: "Connection lost, then recovered",
  args: pageArgs(standInServer({ offline: () => connectionDown })),
  play: async ({ canvasElement }) => {
    connectionDown = true;
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Posted from a tunnel");
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "delayed"), { timeout: 8_000 });
    const item = within(pending(canvasElement)!);
    await expect(item.getByText("Taking longer than usual. Still trying.")).toBeVisible();
    // The author is not trapped: the rest of the page still works.
    await expect(canvas.getByRole("button", { name: "Post" })).toBeEnabled();
    connectionDown = false;
    await userEvent.click(item.getByRole("button", { name: "Try now" }));
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 5_000 });
    await expect(canvas.getAllByText("Posted from a tunnel")).toHaveLength(1);
  },
};

let answersLost = true;
const answerLostServer = standInServer({ answersLost: () => answersLost });

/**
 * The server published the post, and no answer has arrived since. The page
 * cannot know that, so it must not say the post was not sent, and it must not
 * offer to remove it: removing the entry would cancel nothing and would invite
 * a second post.
 */
export const PublishedButAnswerLost: Story = {
  name: "Published, answer lost, cannot be dismissed",
  args: pageArgs(answerLostServer),
  play: async ({ canvasElement }) => {
    answersLost = true;
    const canvas = within(canvasElement);
    const before = answerLostServer.publishedCount();
    await writeAndPost(canvasElement, "Already on the server");
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "delayed"), { timeout: 8_000 });
    // The server has it. The author is told only what is known.
    await expect(answerLostServer.publishedCount() - before).toBe(1);
    const item = pending(canvasElement)!;
    await expect(item).toHaveTextContent("Taking longer than usual. Still trying.");
    await expect(item.textContent ?? "").not.toMatch(/not sent|failed|couldn.t/iu);
    await expect(within(item).queryByRole("alert")).toBeNull();
    // Trying to dismiss it: there is nothing to press but Try now.
    const actions = within(item).getAllByRole("button").map(action => action.textContent?.trim());
    await expect(actions).toEqual(["Try now"]);
    await expect(within(item).queryByRole("button", { name: /discard|dismiss|edit|remove|cancel/iu })).toBeNull();
    // Opening and closing the composer does not stop or remove it.
    const form = await openComposer(canvasElement);
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
    await expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "delayed");
    // When an answer finally arrives it is the first post, once.
    answersLost = false;
    await userEvent.click(within(pending(canvasElement)!).getByRole("button", { name: "Try now" }));
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 5_000 });
    await expect(canvas.getAllByText("Already on the server")).toHaveLength(1);
    await expect(answerLostServer.publishedCount() - before).toBe(1);
  },
};

/** A definite refusal keeps the text and offers to edit it. */
export const Rejected: Story = {
  name: "Rejected, text preserved",
  args: pageArgs(standInServer({ refuse: true })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Keep these words");
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "rejected"));
    const item = within(pending(canvasElement)!);
    await expect(item.getByRole("alert")).toHaveTextContent("You can't post in this community right now.");
    await userEvent.click(item.getByRole("button", { name: "Edit" }));
    const form = within(await canvas.findByRole("form", { name: "Create a post" }));
    await expect(form.getByRole("textbox", { name: "Post" })).toHaveValue("Keep these words");
    await expect(pending(canvasElement)).toBeNull();
  },
};

/** Closing the composer does not stop the post. */
export const DismissedWhileSending: Story = {
  name: "Composer dismissed while sending",
  args: pageArgs(standInServer({ holdMs: 1_500 })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Sent, then I looked away");
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "sending"));
    // Open the composer again and dismiss it while the first post is in flight.
    const form = await openComposer(canvasElement);
    await userEvent.click(form.getByRole("button", { name: "Cancel" }));
    await expect(canvas.queryByRole("form", { name: "Create a post" })).toBeNull();
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 6_000 });
    await expect(canvas.getAllByText("Sent, then I looked away")).toHaveLength(1);
  },
};

/** The application shell around the page: its session and its submission owner. */
function ShellFrame(props: {
  readonly behaviour: Parameters<typeof standInServer>[0];
  /** Runs when the story's stand-in for the sign-in ceremony completes. */
  readonly onSignedInAgain?: () => void;
}) {
  // One server for the life of the frame: the feed read must see what the
  // submission owner sent.
  const server = standInServer(untrack(() => props.behaviour));
  const [session, setSession] = createSignal<ApplicationSessionState>(memberSession);
  const [onCommunity, setOnCommunity] = createSignal(true);
  return (
    <ApplicationSessionProvider state={session}>
      <TextSubmissionProvider transport={server.transport}>
        <nav aria-label="Story controls" class="flex gap-2 p-2">
          <Button onClick={() => setOnCommunity(false)} size="sm" variant="outline">Go elsewhere</Button>
          <Button onClick={() => setOnCommunity(true)} size="sm" variant="outline">Back to community</Button>
          <Button onClick={() => { clearSession(); setSession("anonymous"); }} size="sm" variant="outline">Sign out</Button>
          <Button onClick={() => setSession("anonymous")} size="sm" variant="outline">Let session expire</Button>
          <Button onClick={() => { props.onSignedInAgain?.(); setSession({ ...memberSession }); }} size="sm" variant="outline">Complete sign-in</Button>
        </nav>
        <Show when={onCommunity()} fallback={<main aria-label="Another page" class="p-8">Another page</main>}>
          <CommunityPage
            {...pageArgs(server)}
            resolveSession={async () => { const current = session(); return current === "anonymous" ? "anonymous" : memberSession; }}
          />
        </Show>
      </TextSubmissionProvider>
    </ApplicationSessionProvider>
  );
}

/** Leaving the community does not stop the post; it is there on return. */
export const LeftThePageWhileSending: Story = {
  name: "Left the community while sending",
  render: () => <ShellFrame behaviour={{ holdMs: 1_500 }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Posted on my way out");
    await waitFor(() => expect(pending(canvasElement)).not.toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await expect(await canvas.findByRole("main", { name: "Another page" })).toBeVisible();
    // Long enough for the post to finish with no community page mounted.
    await new Promise(resolve => setTimeout(resolve, 2_000));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await waitFor(() => expect(canvas.getAllByText("Posted on my way out")).toHaveLength(1), { timeout: 6_000 });
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 6_000 });
  },
};

let signedOutConnectionDown = true;

/**
 * Pending posts belong to the account. Signing out clears them for good: the
 * same account signing back in does not bring the post back or send it again.
 */
export const SignedOutWhilePending: Story = {
  name: "Signed out with a post pending",
  render: () => <ShellFrame behaviour={{ offline: () => signedOutConnectionDown }} />,
  play: async ({ canvasElement }) => {
    signedOutConnectionDown = true;
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Only mine to see");
    await waitFor(() => expect(pending(canvasElement)).not.toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await canvas.findByRole("heading", { name: "Night Shift" });
    await expect(canvas.queryByText("Only mine to see")).toBeNull();
    await expect(pending(canvasElement)).toBeNull();
    // The same account returns, and the connection with it.
    signedOutConnectionDown = false;
    await userEvent.click(canvas.getByRole("button", { name: "Complete sign-in" }));
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await canvas.findByRole("button", { name: "Post" });
    await new Promise(resolve => setTimeout(resolve, 2_000));
    await expect(canvas.queryByText("Only mine to see")).toBeNull();
    await expect(pending(canvasElement)).toBeNull();
  },
};

let expiredConnectionDown = true;

/**
 * The session ended without a sign-out. The post is held and shown to no one,
 * and it is sent once the same account is signed in again.
 */
export const SessionLostWhilePending: Story = {
  name: "Session lost with a post pending, same account returns",
  render: () => <ShellFrame behaviour={{ offline: () => expiredConnectionDown }} onSignedInAgain={() => { expiredConnectionDown = false; }} />,
  play: async ({ canvasElement }) => {
    expiredConnectionDown = true;
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Held until I am back");
    await waitFor(() => expect(pending(canvasElement)).not.toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Let session expire" }));
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await canvas.findByRole("heading", { name: "Night Shift" });
    await expect(canvas.queryByText("Held until I am back")).toBeNull();
    // Away from the community when the same account signs in again: the held
    // post is sent with no page mounted, and is there on return.
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await userEvent.click(canvas.getByRole("button", { name: "Complete sign-in" }));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await waitFor(() => expect(canvas.getAllByText("Held until I am back")).toHaveLength(1), { timeout: 8_000 });
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 8_000 });
  },
};

let sessionValid = true;
let expiredAttempts = 0;

/**
 * The session expired before the post was sent. Delivery stops instead of
 * promising progress, the post says what the author has to do, and the same
 * request goes out once the same account is signed in again.
 */
export const SessionExpiredThenSignedIn: Story = {
  name: "Session expired, then signed in again",
  render: () => (
    <ShellFrame
      behaviour={{ signedIn: () => { if (!sessionValid) expiredAttempts += 1; return sessionValid; } }}
      onSignedInAgain={() => { sessionValid = true; }}
    />
  ),
  play: async ({ canvasElement }) => {
    sessionValid = false;
    expiredAttempts = 0;
    const canvas = within(canvasElement);
    await writeAndPost(canvasElement, "Written before my session ran out");
    await waitFor(() => expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "sign_in_required"));
    const item = pending(canvasElement)!;
    await expect(item).toHaveTextContent("Sign in again to finish posting.");
    await expect(item.textContent ?? "").not.toMatch(/still trying/iu);
    await expect(within(item).getByRole("button", { name: "Sign in" })).toBeVisible();
    // It is held, not retried: no further request goes out while signed out.
    await new Promise(resolve => setTimeout(resolve, 2_500));
    await expect(expiredAttempts).toBe(1);
    await expect(pending(canvasElement)).toHaveAttribute("data-pending-text-post-status", "sign_in_required");
    // The same account signs in again and the held post is published once.
    await userEvent.click(canvas.getByRole("button", { name: "Complete sign-in" }));
    await waitFor(() => expect(pending(canvasElement)).toBeNull(), { timeout: 6_000 });
    await expect(canvas.getAllByText("Written before my session ran out")).toHaveLength(1);
  },
};

/** A server answer carrying only what the song observer's projection reads. */
const songAnswer = (fields: object): MediaSubmissionSnapshot => JSON.parse(JSON.stringify({ submission_id: "song-1", ...fields }));
const songProcessing = (phase: string) => songAnswer({ status: "processing", phase });
const songPublished = songAnswer({ status: "published", published_resource: { post_id: "song-post-1", href: "/posts/midnight-waves" } });
const songPost: CommunityPost = {
  id: "song-post-1",
  title: "Midnight Waves",
  body: "",
  kind: "song",
  mediaTitle: "Midnight Waves",
  score: 0,
  publishedAt: "2026-10-06T00:00:00.000Z",
  authorHandle: "Harbor",
  commentCount: 0,
};

/**
 * The community page with a song the server has already accepted, as the page
 * is when the song steps close. `answers` is what the server reports on each
 * later read; the last one repeats.
 */
function SongFrame(props: {
  readonly answers: readonly (MediaSubmissionSnapshot | "unanswered")[];
  readonly rerun?: readonly MediaSubmissionSnapshot[];
  readonly originalRequired?: boolean;
  readonly originalUnanswered?: boolean;
}) {
  const answers = [...untrack(() => props.answers)];
  const rerun = [...untrack(() => props.rerun ?? [])];
  let current: MediaSubmissionSnapshot | "unanswered" = songProcessing("finalize");
  let originalPending = false;
  const store = createSongSubmissionStore({ observeIntervalMs: 700 });
  const [session] = createSignal<ApplicationSessionState>(memberSession);
  const [onCommunity, setOnCommunity] = createSignal(true);
  store.adopt({
    submissionId: "song-1",
    accountId: memberSession.userId,
    communityId,
    title: "Midnight Waves",
    authorHandle: "Harbor",
    view: { status: "processing", submissionId: "song-1", phase: "finalize" },
    source: {
      ...(props.originalRequired ? { hasPendingOriginal: () => originalPending, retryOriginal: async () => {
        originalPending = false;
        current = songProcessing("decision");
        answers.splice(0, answers.length, current, songPublished);
        return current;
      }, bindOriginal: async (link: string) => {
        if (link !== "/posts/original-song") throw new Error("ineligible original");
        if (props.originalUnanswered) { originalPending = true; throw new Error("answer lost"); }
        current = songProcessing("decision");
        answers.splice(0, answers.length, current, songPublished);
        return current;
      } } : {}),
      refresh: async () => {
        current = answers.length > 1 ? answers.shift() ?? current : answers[0] ?? current;
        if (current === "unanswered") throw new Error("no answer");
        return current;
      },
      retry: async () => {
        const next = rerun.shift() ?? songProcessing("analysis");
        answers.splice(0, answers.length, ...rerun.splice(0), songPublished);
        return next;
      },
    },
  });
  const server = standInServer();
  return (
    <ApplicationSessionProvider state={session}>
      <SongSubmissionProvider store={store}>
        <nav aria-label="Story controls" class="flex gap-2 p-2">
          <Button onClick={() => setOnCommunity(false)} size="sm" variant="outline">Go elsewhere</Button>
          <Button onClick={() => setOnCommunity(true)} size="sm" variant="outline">Back to community</Button>
        </nav>
        <Show when={onCommunity()} fallback={<main aria-label="Another page" class="p-8">Another page</main>}>
          <CommunityPage
            {...pageArgs(server)}
            loadThreads={async () => ({ posts: current !== "unanswered" && current.status === "published" ? [songPost, existingPost] : [existingPost], nextCursor: null })}
          />
        </Show>
      </SongSubmissionProvider>
    </ApplicationSessionProvider>
  );
}

const pendingSong = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>("[data-pending-song]");

function SongUploadFrame(props: { readonly unknownSize?: boolean } = {}) {
  const upload = createHeldSongUploadTransport(props);
  return <>
    <nav aria-label="Upload story controls" class="fixed right-3 top-3 z-[80] flex gap-2">
      <Button onClick={() => upload.progress(75)} size="sm">Upload to 75%</Button>
      <Button onClick={() => { if (upload.commands.includes("finalize") || upload.commands.includes("terms")) throw new Error("Stopped upload was finalized"); }} size="sm">Verify stopped upload</Button>
      <Button onClick={() => { if (upload.commands.join(",") !== "reserve,start,cancel" || upload.uploadCount() !== 1) throw new Error("Upload cancellation commands were incorrect"); }} size="sm">Verify cancellation</Button>
      <Button onClick={upload.finish} size="sm">Finish upload</Button>
    </nav>
    <CommunityPage {...pageArgs(standInServer())} mediaSubmissionTransport={upload.transport} />
  </>;
}

/** The same page and song entry the author uses, with upload progress held. */
export const SongUploadProgress: Story = {
  name: "Song: upload progress, then Royalties",
  render: () => <SongUploadFrame />,
  play: async ({ canvasElement }) => {
    await openComposer(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Choose a song file"),
      new File([new Uint8Array(100)], "midnight-waves.mp3", { type: "audio/mpeg" }));
    await canvas.findByRole("heading", { name: "Song" });
    const next = canvas.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(next).toBeEnabled());
    await userEvent.click(next);
    const progress = await canvas.findByRole("progressbar", { name: "Audio upload" });
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "0"));
    await expect(canvas.getByRole("button", { name: "Stop upload" })).toBeVisible();
    await expect(next).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Upload to 75%" }));
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "75"));
    await userEvent.click(canvas.getByRole("button", { name: "Finish upload" }));
    await canvas.findByRole("heading", { name: "Royalties" });
    await expect(canvas.queryByRole("progressbar", { name: "Audio upload" })).toBeNull();
  },
};

async function beginHeldUpload(canvasElement: HTMLElement) {
  await openComposer(canvasElement);
  const canvas = within(canvasElement);
  await userEvent.upload(canvas.getByLabelText("Choose a song file"), new File([new Uint8Array(100)], "midnight-waves.mp3", { type: "audio/mpeg" }));
  const next = await canvas.findByRole("button", { name: "Continue" });
  await waitFor(() => expect(next).toBeEnabled());
  await userEvent.click(next);
  await canvas.findByRole("progressbar", { name: "Audio upload" });
  return canvas;
}

export const SongUploadStopThenRetry: Story = {
  render: () => <SongUploadFrame />,
  play: async ({ canvasElement }) => {
    const canvas = await beginHeldUpload(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Stop upload" }));
    await canvas.findByRole("heading", { name: "Audio upload needs another try" });
    await userEvent.click(canvas.getByRole("button", { name: "Verify stopped upload" }));
    const retry = canvas.getByRole("button", { name: "Try upload again" });
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);
    const progress = await canvas.findByRole("progressbar", { name: "Audio upload" });
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "0"));
    await userEvent.click(canvas.getByRole("button", { name: "Finish upload" }));
    await canvas.findByRole("heading", { name: "Royalties" });
  },
};

export const SongUploadStopThenCancel: Story = {
  render: () => <SongUploadFrame />,
  play: async ({ canvasElement }) => {
    const canvas = await beginHeldUpload(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Stop upload" }));
    await canvas.findByRole("heading", { name: "Audio upload needs another try" });
    const cancel = canvas.getByRole("button", { name: "Cancel song submission" });
    await waitFor(() => expect(cancel).toBeEnabled());
    await userEvent.click(cancel);
    await waitFor(() => expect(canvas.queryByRole("heading", { name: "Audio upload needs another try" })).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Verify cancellation" }));
    await expect(canvas.getByRole("heading", { name: "Song" })).toBeVisible();
    await expect(canvas.queryByText("Selected file: midnight-waves.mp3")).toBeNull();
  },
};

export const SongUploadUnknownSize: Story = {
  render: () => <SongUploadFrame unknownSize />,
  play: async ({ canvasElement }) => {
    const canvas = await beginHeldUpload(canvasElement);
    await expect(canvas.getByRole("progressbar", { name: "Audio upload" })).not.toHaveAttribute("aria-valuenow");
    await userEvent.click(canvas.getByRole("button", { name: "Finish upload" }));
    await canvas.findByRole("heading", { name: "Royalties" });
  },
};

/** A submitted song names the stage the server is on, in order, and is then in the feed. */
export const SongMovesThroughItsStages: Story = {
  name: "Song: each processing stage, then published",
  render: () => <SongFrame answers={[songProcessing("finalize"), songProcessing("analysis"), songProcessing("decision"), songProcessing("publish"), songPublished]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const seen: string[] = [];
    await waitFor(() => {
      const item = pendingSong(canvasElement);
      const stage = SONG_STAGES.find(name => item?.textContent?.includes(name));
      if (stage !== undefined && seen.at(-1) !== stage) seen.push(stage);
      expect(seen).toEqual([...SONG_STAGES]);
    }, { timeout: 12_000, interval: 100 });
    // No status button, no paused note, no identifier field: the stage is the status.
    await expect(canvas.queryByRole("button", { name: /check status/iu })).toBeNull();
    await expect(canvas.queryByText(/automatic checks paused/iu)).toBeNull();
    await expect(canvas.queryByLabelText(/asset id/iu)).toBeNull();
    // Published: the real song post takes the entry's place, once.
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 8_000 });
    await expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1);
  },
};

export const SongNeedsOriginal: Story = {
  name: "Song: name the original, recover from a rejected choice",
  render: () => <SongFrame originalRequired answers={[songAnswer({ status: "action_required", action: { kind: "reference_required", reference_request_ref: "reference-1", expires_at: "2099-01-01T00:00:00Z" } })]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = await canvas.findByRole("textbox", { name: "Original song link" });
    await userEvent.type(field, "/posts/wrong-song");
    await userEvent.click(canvas.getByRole("button", { name: "Use this original song" }));
    await canvas.findByText(/We couldn't confirm that original song/u);
    await expect(field).toBeEnabled();
    await userEvent.clear(field);
    await userEvent.type(field, "/posts/original-song");
    await userEvent.click(canvas.getByRole("button", { name: "Use this original song" }));
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 8_000 });
    await expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1);
  },
};

export const SongOriginalUnanswered: Story = {
  name: "Song: preserve an unanswered original choice",
  render: () => <SongFrame originalRequired originalUnanswered answers={[songAnswer({ status: "action_required", action: { kind: "reference_required", reference_request_ref: "reference-1", expires_at: "2099-01-01T00:00:00Z" } })]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const field = await canvas.findByRole("textbox", { name: "Original song link" });
    await userEvent.type(field, "/posts/original-song");
    await userEvent.click(canvas.getByRole("button", { name: "Use this original song" }));
    await canvas.findByRole("button", { name: "Try this original again" });
    await expect(field).toBeDisabled();
    await expect(field).toHaveValue("/posts/original-song");
    await expect(canvas.getByRole("button", { name: "Use this original song" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await canvas.findByRole("main", { name: "Another page" });
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    const restored = await canvas.findByRole("textbox", { name: "Original song link" });
    await expect(restored).toBeDisabled();
    await expect(restored).toHaveValue("/posts/original-song");
    await userEvent.click(canvas.getByRole("button", { name: "Try this original again" }));
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 8_000 });
    await expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1);
  },
};

/** Waiting for a moderator is a different wait from processing, and says so. */
export const SongWaitingForReview: Story = {
  name: "Song: waiting for a moderator, not processing",
  render: () => <SongFrame answers={[songAnswer({ status: "manual_review", reason_code: "review_required", review_ref: "review-1" })]} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(pendingSong(canvasElement)).toHaveAttribute("data-pending-song-status", "manual_review"), { timeout: 6_000 });
    const item = within(pendingSong(canvasElement)!);
    await expect(item.getByText("This song is waiting for a moderator's review before it can be published.")).toBeVisible();
    // It is not shown as a processing step, and it cannot be waved away.
    await expect(item.queryByRole("progressbar")).toBeNull();
    for (const stage of SONG_STAGES) await expect(item.queryByText(new RegExp(stage, "u"))).toBeNull();
    await expect(item.queryByRole("alert")).toBeNull();
    await expect(item.queryByRole("button")).toBeNull();
  },
};

/** Processing stopped. The author is told plainly and can run it again. */
export const SongProcessingFailedThenRerun: Story = {
  name: "Song: processing failed, then run again",
  render: () => <SongFrame answers={[songAnswer({ status: "processing_failed", reason_code: "analysis_failed", retryable: true })]} rerun={[songProcessing("analysis"), songProcessing("publish")]} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(pendingSong(canvasElement)).toHaveAttribute("data-pending-song-status", "processing_failed"), { timeout: 6_000 });
    const item = within(pendingSong(canvasElement)!);
    await expect(item.getByRole("alert")).toHaveTextContent("Processing stopped before this song was published.");
    await userEvent.click(item.getByRole("button", { name: "Try processing again" }));
    await waitFor(() => expect(pendingSong(canvasElement)).toHaveAttribute("data-pending-song-status", "processing"), { timeout: 6_000 });
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 12_000 });
    await expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1);
  },
};

/** The author leaves while the song is processing; it is watched all the same. */
export const SongLeftWhileProcessing: Story = {
  name: "Song: left the community while processing",
  render: () => <SongFrame answers={[songProcessing("analysis"), songProcessing("analysis"), songProcessing("decision"), songPublished]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(pendingSong(canvasElement)).not.toBeNull(), { timeout: 6_000 });
    await userEvent.click(canvas.getByRole("button", { name: "Go elsewhere" }));
    await expect(await canvas.findByRole("main", { name: "Another page" })).toBeVisible();
    // Long enough for the song to finish with no community page mounted.
    await new Promise(resolve => setTimeout(resolve, 3_500));
    await userEvent.click(canvas.getByRole("button", { name: "Back to community" }));
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1), { timeout: 8_000 });
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 8_000 });
  },
};

/** Reads of the song's state go unanswered. That is said of the reads, not of the song. */
export const SongStatusUnanswered: Story = {
  name: "Song: status reads unanswered",
  render: () => <SongFrame answers={["unanswered"]} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(pendingSong(canvasElement)?.textContent ?? "").toContain("taking longer than usual"), { timeout: 20_000 });
    const item = within(pendingSong(canvasElement)!);
    await expect(item.getByText("Checking on this song is taking longer than usual. Still trying.")).toBeVisible();
    await expect(item.queryByRole("alert")).toBeNull();
    await expect(pendingSong(canvasElement)!.textContent ?? "").not.toMatch(/failed|couldn.t|stopped/iu);
    await expect(item.getByRole("button", { name: "Check now" })).toBeVisible();
  },
};
