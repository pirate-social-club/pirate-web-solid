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
import { TextSubmissionProvider } from "../../posts/text-submission/text-submission-store.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import { CommunityPage } from "./community-page";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import type { CommunityPageSuccess } from "./community-page.model";
import type { CommunityViewerVoteClient } from "./community-viewer-vote-api.ts";

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

/** Desktop: the composer is a card in the right column, beside the feed. */
export const ComposerBesideTheFeed: Story = {
  name: "Desktop composer beside the feed",
  args: pageArgs(standInServer()),
  play: async ({ canvasElement }) => {
    await openComposer(canvasElement);
    const panel = canvasElement.querySelector<HTMLElement>("[data-text-post-panel]")!;
    const feed = within(canvasElement).getByRole("main", { name: "Community feed" });
    await waitFor(() => {
      expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(feed.getBoundingClientRect().right);
      expect(panel.getBoundingClientRect().width).toBeLessThan(feed.getBoundingClientRect().width);
    });
    // The feed stays readable: nothing covers the page.
    await expect(within(feed).getByText(existingPost.title)).toBeVisible();
  },
};

/** Phone: the same composer is a sheet over the bottom of the screen. */
export const ComposerSheetOnMobile: Story = {
  name: "Mobile composer sheet",
  args: pageArgs(standInServer()),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    await openComposer(canvasElement);
    const sheet = canvasElement.querySelector<HTMLElement>("[data-text-post-panel] form")!.parentElement!;
    await waitFor(() => {
      const view = canvasElement.ownerDocument.defaultView!;
      const box = sheet.getBoundingClientRect();
      // Anchored to the bottom edge, full width, and never taller than the screen.
      expect(Math.abs(box.bottom - view.innerHeight)).toBeLessThanOrEqual(1);
      expect(Math.round(box.width)).toBe(view.innerWidth);
      expect(box.top).toBeGreaterThanOrEqual(0);
    });
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
