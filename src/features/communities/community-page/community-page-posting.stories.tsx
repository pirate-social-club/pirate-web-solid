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
import { SONG_PROCESSING_PHASES, SONG_PROCESSING_TEXT } from "../../posts/song-submission/pending-songs.tsx";
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
import { installCommunityActivityStoryFixture } from "./community-page-activity-story-fixtures.ts";

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
  beforeEach: () => installCommunityActivityStoryFixture(communityId, memberSession),
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
  await userEvent.type(form.getByRole("textbox", { name: "Title" }), "Weekly listening thread");
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
    // Paper rulings 10 and 11: close and "New post" at the top left, no
    // Cancel, and Title is required with an asterisk.
    const form = within(panel);
    const close = form.getByRole("button", { name: "Close composer" });
    const heading = form.getByRole("heading", { name: "New post" });
    await expect(close.getBoundingClientRect().right).toBeLessThanOrEqual(heading.getBoundingClientRect().left);
    await expect(form.queryByRole("button", { name: "Cancel" })).toBeNull();
    await expect(form.getByText("*")).toBeVisible();
    await expect(form.queryByText(/optional/iu)).toBeNull();
    await userEvent.type(form.getByRole("textbox", { name: "Post" }), "No title yet");
    await expect(form.getByRole("button", { name: "Post" })).toBeDisabled();
  },
};

/**
 * The phone presentation of Paper rulings 10-12, asserted as intent and not
 * only as fit: writing is the whole screen, flat, under a bar with close and
 * "New post", with nothing pushing the fields down, and the labelled Post
 * button full width in a footer.
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
    // The bar above the fields holds the way out and names the screen.
    expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(firstField.getBoundingClientRect().top);
    expect(within(bar).getByRole("button", { name: "Close composer" })).toBeVisible();
    expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth);
  });
  return bar;
}

/**
 * Paper rulings 10-12 on the phone text form: the bar names the screen "New
 * post" beside close, and the labelled Post button is full width in a footer
 * at the bottom of the screen.
 */
async function expectTextPhoneChrome(canvasElement: HTMLElement, bar: HTMLElement) {
  const view = canvasElement.ownerDocument.defaultView!;
  const footer = canvasElement.querySelector<HTMLElement>("[data-composer-footer]")!;
  await waitFor(() => {
    expect(within(bar).getByRole("heading", { name: "New post" })).toBeVisible();
    expect(within(bar).queryByRole("button", { name: "Post" })).toBeNull();
    const post = within(footer).getByRole("button", { name: "Post" });
    expect(Math.abs(footer.getBoundingClientRect().bottom - view.innerHeight)).toBeLessThanOrEqual(1);
    expect(Math.round(post.getBoundingClientRect().width)).toBe(Math.round(footer.getBoundingClientRect().width) - 32);
  });
  return footer;
}

/**
 * Scrolled to the end of a long text, the action bar is still on screen.
 * Whether the page or the text field scrolls depends on the screen height: at
 * 320x568 the post form fits and its field scrolls inside itself, on a shorter
 * screen or a taller form the page scrolls. Either way something must scroll,
 * and the bar must stay put.
 */
async function expectBarStaysOnScreen(canvasElement: HTMLElement, bar: HTMLElement, field: HTMLElement) {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView!;
  const pageScrolls = doc.documentElement.scrollHeight > view.innerHeight + 1;
  if (pageScrolls) {
    view.scrollTo({ top: doc.documentElement.scrollHeight });
    await waitFor(() => expect(view.scrollY).toBeGreaterThan(0));
  } else {
    await expect(field.scrollHeight).toBeGreaterThan(field.clientHeight);
    field.scrollTop = field.scrollHeight;
    await waitFor(() => expect(field.scrollTop).toBeGreaterThan(0));
  }
  await waitFor(() => {
    const box = bar.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual(view.innerHeight);
  });
  view.scrollTo({ top: 0 });
  field.scrollTop = 0;
}

/** A long post, so the page or the text field has to scroll. */
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
    const footer = await expectTextPhoneChrome(canvasElement, bar);
    await expect(within(footer).getByRole("button", { name: "Post" })).toBeDisabled();
    // Song and Video are a plain row directly under the text field.
    const song = form.getByRole("button", { name: "Post a song" });
    const video = form.getByRole("button", { name: "Post a video" });
    await expect(song.getBoundingClientRect().top).toBeGreaterThanOrEqual(body.getBoundingClientRect().bottom);
    await expect(Math.abs(song.getBoundingClientRect().top - video.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    // The footer's is the only Post button.
    await expect(form.getAllByRole("button", { name: "Post" })).toHaveLength(1);
    await userEvent.click(body);
    await userEvent.paste(longPost);
    // A post needs its title as well as its text.
    await expect(within(footer).getByRole("button", { name: "Post" })).toBeDisabled();
    await userEvent.type(title, "Weekly listening thread");
    await expect(within(footer).getByRole("button", { name: "Post" })).toBeEnabled();
    await expectBarStaysOnScreen(canvasElement, bar, body);
    await expectBarStaysOnScreen(canvasElement, footer, body);
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
    await expectTextPhoneChrome(canvasElement, bar);
    const body = form.getByRole("textbox", { name: "Post" });
    await userEvent.click(body);
    await userEvent.paste(longPost);
    await expectBarStaysOnScreen(canvasElement, bar, body);
    await userEvent.click(within(bar).getByRole("button", { name: "Close composer" }));
    await waitFor(() => expect(footer.getBoundingClientRect().height).toBeGreaterThan(0));
  },
};

/** Posts a song through the phone steps inside the real shell and returns the shell's bottom navigation. */
async function postSongInsideTheShell(canvasElement: HTMLElement) {
  const nav = await waitFor(() => {
    const found = canvasElement.ownerDocument.querySelector<HTMLElement>("nav[aria-label='Primary navigation']");
    expect(found).not.toBeNull();
    expect(found!.getBoundingClientRect().height).toBeGreaterThan(0);
    return found!;
  });
  const canvas = await openSongInMain(canvasElement);
  const footer = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-footer]")!);
  for (const step of ["Royalties", "Review"]) {
    await waitFor(() => expect(footer().getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(footer().getByRole("button", { name: "Next" }));
    await canvas.findByRole("heading", { name: step });
  }
  await userEvent.click(await waitFor(() => footer().getByRole("button", { name: "Post" })));
  const posted = await waitFor(() => {
    const found = canvasElement.querySelector<HTMLElement>("[data-posted-song]");
    expect(found).not.toBeNull();
    return found!;
  });
  // The posted state is still part of composing: the shell keeps its bottom
  // navigation hidden and the composer keeps its history entry for Back.
  await waitFor(() => expect(nav.getBoundingClientRect().height).toBe(0));
  await expect(canvasElement.ownerDocument.defaultView!.history.state?.pirateComposer).toBe(true);
  return { canvas, nav, posted };
}

const songInTheShell = (args: CommunityPageProps) => (
  <ActivePersonaProvider>
    <ApplicationChrome currentPath="/c/night-shift" hideMobileHeader mobileActiveItem="none" mode="standard" signedIn>
      <SongPostingPreview {...args} />
    </ApplicationChrome>
  </ActivePersonaProvider>
);

/** Phone, real shell: Back on the posted song's state returns to the feed and the bottom navigation. */
export const MobilePostedSongBackInsideTheAppShell: Story = {
  name: "Mobile posted song: Back inside the app shell",
  args: pageArgs(standInServer()),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: songInTheShell,
  play: async ({ canvasElement }) => {
    const { canvas, nav } = await postSongInsideTheShell(canvasElement);
    canvasElement.ownerDocument.defaultView!.history.back();
    await waitFor(() => expect(canvasElement.querySelector("[data-posted-song]")).toBeNull());
    await expect(canvas.getByRole("main", { name: "Community feed" })).toBeVisible();
    await waitFor(() => expect(nav.getBoundingClientRect().height).toBeGreaterThan(0));
  },
};

/** Phone, real shell: Close does the same and gives back the history entry it held. */
export const MobilePostedSongCloseInsideTheAppShell: Story = {
  name: "Mobile posted song: Close inside the app shell",
  args: pageArgs(standInServer()),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: songInTheShell,
  play: async ({ canvasElement }) => {
    const { canvas, nav, posted } = await postSongInsideTheShell(canvasElement);
    await userEvent.click(within(posted).getByRole("button", { name: "Close song status" }));
    await waitFor(() => expect(canvasElement.querySelector("[data-posted-song]")).toBeNull());
    await expect(canvas.getByRole("main", { name: "Community feed" })).toBeVisible();
    await waitFor(() => expect(nav.getBoundingClientRect().height).toBeGreaterThan(0));
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView!.history.state?.pirateComposer).not.toBe(true));
  },
};

export const CancelKeepsTheDraft: Story = {
  name: "Close returns to the feed and keeps the draft",
  args: pageArgs(standInServer()),
  play: async ({ canvasElement }) => {
    const form = await openComposer(canvasElement);
    await userEvent.type(form.getByRole("textbox", { name: "Title" }), "A draft title");
    await userEvent.type(form.getByRole("textbox", { name: "Post" }), "A draft to return to");
    await userEvent.click(form.getByRole("button", { name: "Close composer" }));
    await expect(await within(canvasElement).findByText(existingPost.title)).toBeVisible();
    await expect(within(canvasElement).queryByRole("form", { name: "Create a post" })).toBeNull();
    const reopened = await openComposer(canvasElement);
    await expect(reopened.getByRole("textbox", { name: "Title" })).toHaveValue("A draft title");
    await expect(reopened.getByRole("textbox", { name: "Post" })).toHaveValue("A draft to return to");
  },
};

async function selectSongStems(canvas: ReturnType<typeof within>) {
  for (const stem of ["instrumental", "vocals"] as const) {
    await userEvent.upload(await canvas.findByLabelText(`Upload ${stem}`),
      new File([new Uint8Array(100)], `${stem}.mp3`, { type: "audio/mpeg" }));
  }
}

async function openSongInMain(canvasElement: HTMLElement, withStems = true) {
  await openComposer(canvasElement);
  const canvas = within(canvasElement);
  await userEvent.upload(canvas.getByLabelText("Choose a song file"),
    new File([new Uint8Array(100)], "midnight-waves.mp3", { type: "audio/mpeg" }));
  // The composer header names the step on desktop and phone (Paper ruling 11).
  const form = await canvas.findByRole("form", { name: "Post a song" });
  if (withStems) await selectSongStems(canvas);
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

/**
 * Paper rulings 11 and 12 on the phone song steps: the bar has close or back
 * beside the step's centred name and no forward control; the labelled
 * forward button is full width in a footer at the bottom of the screen.
 */
async function expectSongPhoneChrome(canvasElement: HTMLElement, step: string, forward: string) {
  const view = canvasElement.ownerDocument.defaultView!;
  const bar = within(canvasElement.querySelector<HTMLElement>("[data-composer-sticky-header]")!);
  const footer = await waitFor(() => {
    const found = canvasElement.querySelector<HTMLElement>("[data-composer-footer]");
    expect(found).not.toBeNull();
    return found!;
  });
  await waitFor(() => {
    expect(bar.getByRole("heading", { name: step })).toBeVisible();
    expect(bar.queryByRole("button", { name: forward })).toBeNull();
    const button = within(footer).getByRole("button", { name: forward });
    expect(Math.abs(footer.getBoundingClientRect().bottom - view.innerHeight)).toBeLessThanOrEqual(1);
    expect(Math.round(button.getBoundingClientRect().width)).toBe(Math.round(footer.getBoundingClientRect().width) - 32);
  });
  // There is no separate Back button: the bar's arrow is the only way back.
  await expect(within(footer).queryByRole("button", { name: "Back" })).toBeNull();
  return footer;
}

/**
 * Paper ruling 14: after Post the author stays on the page and sees the
 * song's one centred state, not the feed. Closing it returns to the feed,
 * where the pending card carries a song that is still in progress.
 */
async function expectPostedSongThenFeed(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const posted = await waitFor(() => {
    const found = canvasElement.querySelector<HTMLElement>("[data-posted-song]");
    expect(found).not.toBeNull();
    return found!;
  });
  await expect(canvas.queryByRole("form", { name: "Post a song" })).toBeNull();
  await expect(canvas.queryByRole("main", { name: "Community feed" })).toBeNull();
  await expect(canvasElement.querySelectorAll("[data-pending-song]")).toHaveLength(0);
  await expect(within(posted).getByRole("heading", { name: /Processing your song|Published/u })).toBeVisible();
  const stillProcessing = posted.getAttribute("data-posted-song-status") !== "published";
  await userEvent.click(within(posted).getByRole("button", { name: "Close song status" }));
  await waitFor(() => expect(canvas.getByRole("main", { name: "Community feed" })).toBeVisible());
  if (stillProcessing) await expect(canvasElement.querySelectorAll("[data-pending-song]")).toHaveLength(1);
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
    // Measure the initial surface before hidden file inputs move focus/scroll.
    const canvas = await openSongInMain(canvasElement, false);
    const audio = canvas.getByRole("button", { name: "Remove audio" });
    const bar = await expectFlatPhoneComposer(canvasElement, audio);
    const footer = await expectSongPhoneChrome(canvasElement, "Song", "Next");
    await expect(canvas.getAllByRole("button", { name: "Next" })).toHaveLength(1);
    const lyrics = canvas.getByRole("textbox", { name: /Lyrics/u });
    await userEvent.click(lyrics);
    await userEvent.paste(longPost);
    await expectBarStaysOnScreen(canvasElement, bar, lyrics);
    await expectBarStaysOnScreen(canvasElement, footer, lyrics);
  },
};

export const SongStepsReturnToFeed: Story = {
  name: "Song, Royalties and Review stay in the form, then the posted state",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = await openSongInMain(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    const royalties = await canvas.findByRole("heading", { name: "Royalties" });
    await expect(canvas.getByRole("form", { name: "Post a song" }).closest("main")).not.toBeNull();
    // Paper ruling 11: the way back is the arrow beside the step's name; there
    // is no Cancel and no separate Back button.
    const back = canvas.getByRole("button", { name: "Back" });
    await expect(back.closest("header")).toBe(royalties.closest("header"));
    await expect(back.getBoundingClientRect().right).toBeLessThanOrEqual(royalties.getBoundingClientRect().left);
    await expect(canvas.getAllByRole("button", { name: "Back" })).toHaveLength(1);
    await expect(canvas.queryByRole("button", { name: "Cancel" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await canvas.findByRole("heading", { name: "Review" });
    await expect(canvas.getByRole("form", { name: "Post a song" }).closest("main")).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    await expectPostedSongThenFeed(canvasElement);
  },
};

export const SongStepsReturnToFeedOnMobile: Story = {
  name: "Mobile song steps move through the footer, then the posted state",
  args: pageArgs(standInServer()),
  render: args => <SongPostingPreview {...args} />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = await openSongInMain(canvasElement);
    const bar = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-sticky-header]")!);
    const footer = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-footer]")!);
    await expectSongPhoneChrome(canvasElement, "Song", "Next");
    await waitFor(() => expect(footer().getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(footer().getByRole("button", { name: "Next" }));
    // Royalties: back on the left beside the step's name, forward below.
    await waitFor(() => expect(bar().getByRole("button", { name: "Back" })).toBeVisible());
    await expectSongPhoneChrome(canvasElement, "Royalties", "Next");
    await expect(canvas.getByText(/earnings/iu)).toBeVisible();
    await waitFor(() => expect(footer().getByRole("button", { name: "Next" })).toBeEnabled());
    await userEvent.click(footer().getByRole("button", { name: "Next" }));
    // Review: the footer's button publishes.
    await expectSongPhoneChrome(canvasElement, "Review", "Post");
    const publish = await waitFor(() => footer().getByRole("button", { name: "Post" }));
    await expect(canvas.getAllByRole("button", { name: "Post" })).toHaveLength(1);
    await userEvent.click(publish);
    await expectPostedSongThenFeed(canvasElement);
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
    const footer = () => within(canvasElement.querySelector<HTMLElement>("[data-composer-footer]")!);
    await waitFor(() => expect(footer().getByRole("button", { name: "Next" })).toBeEnabled());
    // Continue starts the upload, which the stand-in server holds open.
    await userEvent.click(footer().getByRole("button", { name: "Next" }));
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
    const before = lostAcknowledgementServer.publishedCount();
    await writeAndPost(canvasElement, "Did this arrive?");
    await waitFor(() => expect(pending(canvasElement)).not.toBeNull());
    // Nothing asks the author to check, and nothing calls it failed.
    const item = within(pending(canvasElement)!);
    await expect(item.queryByText(/check again/iu)).toBeNull();
    await expect(item.queryByRole("alert")).toBeNull();
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
    await userEvent.click(form.getByRole("button", { name: "Close composer" }));
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
    await userEvent.click(form.getByRole("button", { name: "Close composer" }));
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
  /** Run again never settles, so the rerun stays busy. */
  readonly heldRetry?: boolean;
  /** Adopt the song for another account or community than the page's. */
  readonly adoptAs?: { readonly accountId?: string; readonly communityId?: string };
  /** Adopt nothing: a fresh store, as after a reload. */
  readonly empty?: boolean;
}) {
  const answers = [...untrack(() => props.answers)];
  const rerun = [...untrack(() => props.rerun ?? [])];
  let current: MediaSubmissionSnapshot | "unanswered" = songProcessing("finalize");
  let originalPending = false;
  const store = createSongSubmissionStore({ observeIntervalMs: 700 });
  const [session] = createSignal<ApplicationSessionState>(memberSession);
  const [onCommunity, setOnCommunity] = createSignal(true);
  if (!props.empty) store.adopt({
    submissionId: "song-1",
    accountId: props.adoptAs?.accountId ?? memberSession.userId,
    communityId: props.adoptAs?.communityId ?? communityId,
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
        if (props.heldRetry) return new Promise<MediaSubmissionSnapshot>(() => {});
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
    await selectSongStems(canvas);
    const next = canvas.getByRole("button", { name: "Next" });
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
  await selectSongStems(canvas);
  const next = await canvas.findByRole("button", { name: "Next" });
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

/**
 * A submitted song says plainly that it is processing, with a bar that moves
 * forward through the server's phases, and is then in the feed.
 */
export const SongMovesThroughItsStages: Story = {
  name: "Song: processing, then published",
  render: () => <SongFrame answers={[songProcessing("finalize"), songProcessing("analysis"), songProcessing("decision"), songProcessing("publish"), songPublished]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const seen: number[] = [];
    await waitFor(() => {
      const item = pendingSong(canvasElement);
      expect(item?.textContent ?? "").toContain(SONG_PROCESSING_TEXT);
      // One plain line: no step count and no phase names.
      expect(item?.textContent ?? "").not.toMatch(/step \d|of \d|Listening|Saving your audio/u);
      const value = Number(item?.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"));
      if (Number.isFinite(value) && seen.at(-1) !== value) seen.push(value);
      expect(seen).toEqual(Array.from({ length: SONG_PROCESSING_PHASES }, (_, index) => index + 1));
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
    await expect(item.queryByText(SONG_PROCESSING_TEXT)).toBeNull();
    await expect(item.queryByRole("alert")).toBeNull();
    // Its only control is Status, which opens the wait; nothing dismisses it.
    await expect(item.getAllByRole("button").map(button => button.textContent)).toEqual(["Status"]);
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

const desktop = {
  globals: { viewport: { value: "desktopReview", isRotated: false } },
  parameters: { viewport: { options: { desktopReview: { name: "Desktop", styles: { width: "1280px", height: "900px" }, type: "desktop" } } } },
} as const;

const failedRetryable = songAnswer({ status: "processing_failed", reason_code: "analysis_failed", retryable: true });
const failedFinal = songAnswer({ status: "processing_failed", reason_code: "analysis_failed", retryable: false });
const reviewRequired = songAnswer({ status: "manual_review", reason_code: "review_required", review_ref: "review-1" });
const reviewUnavailable = songAnswer({ status: "manual_review", reason_code: "moderation_unavailable", review_ref: "review-1" });
const originalRequired = songAnswer({ status: "action_required", action: { kind: "reference_required", reference_request_ref: "reference-1", expires_at: "2099-01-01T00:00:00Z" } });

const statusButton = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLButtonElement>("[data-pending-song-open-status='song-1']");
const postedSong = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>("[data-posted-song]");

/** Waits for the feed card to reach `status`, then checks how it and its Status button are named. */
async function expectNamedCard(canvasElement: HTMLElement, status: string, description: string) {
  await waitFor(() => expect(pendingSong(canvasElement)).toHaveAttribute("data-pending-song-status", status), { timeout: 8_000 });
  const card = pendingSong(canvasElement)!;
  await expect(card).toHaveAccessibleName("Midnight Waves");
  await expect(card).toHaveAccessibleDescription(description);
  const open = within(card).getByRole("button", { name: "Status for Midnight Waves" });
  await expect(open).toHaveTextContent("Status");
  await expect(open).toHaveAccessibleDescription(description);
  // Status is a sibling of the card's other controls, never around them.
  await expect(open.querySelector("a, button, input, textarea, select")).toBeNull();
  return open;
}

/** Opens the status from the feed card: the close takes focus, and no operation starts. */
async function openStatus(canvasElement: HTMLElement, heading: string) {
  const open = statusButton(canvasElement)!;
  await userEvent.click(open);
  const posted = await waitFor(() => { const element = postedSong(canvasElement); expect(element).not.toBeNull(); return element!; });
  await expect(await within(posted).findByRole("heading", { name: heading })).toBeVisible();
  const close = within(posted).getByRole("button", { name: "Close song status" });
  await waitFor(() => expect(close).toHaveFocus());
  return { posted, close };
}

/** Desktop: Status opens the processing card in the real 736px main column; closing returns to Status. */
export const SongStatusFromTheFeed: Story = {
  ...desktop,
  name: "Song status: open from the feed, then close",
  render: () => <SongFrame answers={[songProcessing("analysis")]} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView!.innerWidth).toBe(1280));
    await expectNamedCard(canvasElement, "processing", SONG_PROCESSING_TEXT);
    const { posted, close } = await openStatus(canvasElement, "Processing your song");
    // The approved card fills the main column beside the 320px About rail.
    const column = posted.closest("main")!;
    await expect(Math.round(column.getBoundingClientRect().width)).toBe(736);
    const card = posted.firstElementChild!;
    await expect(Math.round(card.getBoundingClientRect().width)).toBe(736);
    await expect(card.getBoundingClientRect().height).toBeGreaterThanOrEqual(448);
    await expect(getComputedStyle(card).paddingTop).toBe("24px");
    // The banner and community header stay above it.
    await expect(canvasElement.querySelector("[aria-label='Community overview']")).not.toBeNull();
    // The drawing's annotation about reloading ships in no state.
    await expect(canvasElement.textContent ?? "").not.toMatch(/Reloading or stopping watching/u);
    await userEvent.click(close);
    await waitFor(() => expect(postedSong(canvasElement)).toBeNull());
    await waitFor(() => expect(statusButton(canvasElement)).toHaveFocus());
  },
};

/** Waiting for review, in both of the server's wordings. */
export const SongStatusWaitingForReview: Story = {
  ...desktop,
  name: "Song status: waiting for review",
  render: () => <SongFrame answers={[reviewRequired]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "manual_review", "This song is waiting for a moderator's review before it can be published.");
    const { posted } = await openStatus(canvasElement, "Waiting for review");
    await expect(within(posted).getByText("A moderator will check this song.")).toBeVisible();
    await expect(within(posted).getAllByRole("button").map(button => button.getAttribute("aria-label") ?? button.textContent)).toEqual(["Close song status"]);
  },
};

export const SongStatusChecksUnavailable: Story = {
  ...desktop,
  name: "Song status: waiting for review, checks unavailable",
  render: () => <SongFrame answers={[reviewUnavailable]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "manual_review", "This song is waiting for review because automatic checks aren't available right now.");
    const { posted } = await openStatus(canvasElement, "Waiting for review");
    await expect(within(posted).getByText("Automatic checks aren't available right now, so a moderator will check this song.")).toBeVisible();
  },
};

/** A retryable failure: Try again runs it once and stays busy in both places while it runs. */
export const SongStatusRetryBusy: Story = {
  ...desktop,
  name: "Song status: retryable failure, busy rerun",
  render: () => <SongFrame answers={[failedRetryable]} heldRetry />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "processing_failed", "Processing stopped before this song was published.");
    const { posted, close } = await openStatus(canvasElement, "Couldn't process this song");
    const again = within(posted).getByRole("button", { name: "Try again" });
    await expect(again).toBeEnabled();
    await userEvent.click(again);
    // The action is redrawn as the rerun starts; read it again each time.
    await waitFor(() => expect(within(posted).getByRole("button", { name: "Try again" })).toBeDisabled());
    await userEvent.click(close);
    await waitFor(() => expect(within(pendingSong(canvasElement)!).getByRole("button", { name: "Try processing again" })).toBeDisabled());
  },
};

/** A final failure offers no retry; Dismiss removes the card, and nothing can reopen it. */
export const SongStatusFinalFailureDismissed: Story = {
  ...desktop,
  name: "Song status: final failure, dismissed",
  render: () => <SongFrame answers={[failedFinal]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "processing_failed", "This song couldn't be processed and wasn't published.");
    const card = within(pendingSong(canvasElement)!);
    await expect(card.queryByRole("button", { name: "Try processing again" })).toBeNull();
    const { posted, close } = await openStatus(canvasElement, "Couldn't process this song");
    await expect(within(posted).queryByRole("button", { name: "Try again" })).toBeNull();
    await userEvent.click(close);
    await userEvent.click(within(pendingSong(canvasElement)!).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull());
    await expect(statusButton(canvasElement)).toBeNull();
    await expect(postedSong(canvasElement)).toBeNull();
  },
};

/** Slow reads: the processing state offers Check now, and the feed keeps Stop watching here. */
export const SongStatusSlowChecks: Story = {
  ...desktop,
  name: "Song status: slow checks",
  render: () => <SongFrame answers={["unanswered"]} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(pendingSong(canvasElement)?.textContent ?? "").toContain("taking longer than usual"), { timeout: 20_000 });
    const card = within(pendingSong(canvasElement)!);
    await expect(card.getByRole("button", { name: "Stop watching here" })).toBeVisible();
    const { posted } = await openStatus(canvasElement, "Processing your song");
    await expect(within(posted).getByRole("button", { name: "Check now" })).toBeVisible();
  },
};

/**
 * Naming the original song is not one of the drawn states: the status shows
 * the feed card's own controls, without a second Status inside it.
 */
export const SongStatusOriginalRequired: Story = {
  ...desktop,
  name: "Song status: original song required",
  render: () => <SongFrame originalRequired answers={[originalRequired]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "action_required", "The original song this one is based on has to be named before it can be published.");
    const { posted } = await openStatus(canvasElement, "Song");
    await expect(within(posted).getByRole("textbox", { name: "Original song link" })).toBeVisible();
    await expect(within(posted).queryByRole("button", { name: /^Status for/u })).toBeNull();
  },
};

/**
 * The song publishes while its status is open: the status says Published and
 * links to the post; the feed then carries the post and the card goes, so
 * closing falls back to Post.
 */
export const SongStatusPublishedWhileOpen: Story = {
  ...desktop,
  name: "Song status: published while open",
  render: () => <SongFrame answers={[songProcessing("analysis"), songProcessing("analysis"), songProcessing("decision"), songPublished]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "processing", SONG_PROCESSING_TEXT);
    const { posted, close } = await openStatus(canvasElement, "Processing your song");
    await expect(await within(posted).findByRole("heading", { name: "Published" }, { timeout: 8_000 })).toBeVisible();
    const view = within(posted).getByRole("link", { name: "View song" });
    await expect(view).toHaveAttribute("href", "/posts/midnight-waves");
    await expect(view).toHaveAttribute("rel", "external");
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull(), { timeout: 8_000 });
    await userEvent.click(close);
    await waitFor(() => expect(postedSong(canvasElement)).toBeNull());
    // The card that opened it is gone: focus falls back to Post, and nothing recreates the card.
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(canvasElement.querySelector("[data-community-post-slot]")));
    await expect(pendingSong(canvasElement)).toBeNull();
    await expect(canvasElement.querySelectorAll("[data-community-post='song-post-1']")).toHaveLength(1);
  },
};

/** No card and no Status for a song this page's viewer does not own here, or after a reload. */
async function expectNoSongEntry(canvasElement: HTMLElement) {
  await within(canvasElement).findByText("What is the best live arrangement?");
  await expect(pendingSong(canvasElement)).toBeNull();
  await expect(canvasElement.querySelector("[data-pending-song-open-status]")).toBeNull();
  await expect(postedSong(canvasElement)).toBeNull();
}

/** Another account's song in the same store. */
export const SongStatusNotForAnotherAccount: Story = {
  ...desktop,
  name: "Song status: not for another account",
  render: () => <SongFrame adoptAs={{ accountId: "account-2" }} answers={[songProcessing("analysis")]} />,
  play: async ({ canvasElement }) => expectNoSongEntry(canvasElement),
};

/** This account's song in another community. */
export const SongStatusNotForAnotherCommunity: Story = {
  ...desktop,
  name: "Song status: not for another community",
  render: () => <SongFrame adoptAs={{ communityId: "community_other" }} answers={[songProcessing("analysis")]} />,
  play: async ({ canvasElement }) => expectNoSongEntry(canvasElement),
};

/** A fresh store, as after a reload: the status entry is session-only. */
export const SongStatusAbsentAfterReload: Story = {
  ...desktop,
  name: "Song status: absent from a fresh store",
  render: () => <SongFrame empty answers={[songProcessing("analysis")]} />,
  play: async ({ canvasElement }) => expectNoSongEntry(canvasElement),
};

/**
 * A blocked song is not a drawn state, so its status shows the feed card's
 * own controls. Dismissing there closes the status and removes the card;
 * nothing is left to reopen it.
 */
export const SongStatusDismissedFromTheStatus: Story = {
  ...desktop,
  name: "Song status: dismissed from the status",
  render: () => <SongFrame answers={[songAnswer({ status: "blocked", reason_code: "policy_violation" })]} />,
  play: async ({ canvasElement }) => {
    await expectNamedCard(canvasElement, "blocked", "This song was blocked by policy and wasn't published.");
    const { posted } = await openStatus(canvasElement, "Song");
    await userEvent.click(within(posted).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(postedSong(canvasElement)).toBeNull());
    await waitFor(() => expect(pendingSong(canvasElement)).toBeNull());
    await expect(statusButton(canvasElement)).toBeNull();
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(canvasElement.querySelector("[data-community-post-slot]")));
  },
};
