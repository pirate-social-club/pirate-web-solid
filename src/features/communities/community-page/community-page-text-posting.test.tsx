/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { Show, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SessionResolution } from "../../../api/session.ts";
import type { CommunityPost } from "../../community/page-shell/page-shell-model.ts";
import type { PendingSubmissionEnvelopeV1 } from "../../posts/post-composer/pending-submission.ts";
import type { TextContentSubmissionV1 } from "../../posts/post-composer/text-submission-contract.ts";
import {
  AmbiguousTextSubmissionError,
  TextSubmissionServerRejectionError,
  type TextSubmissionTransport,
} from "../../posts/post-composer/text-submission-transport.ts";
import { TextSubmissionProvider } from "../../posts/text-submission/text-submission-store.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import CommunityPage from "./community-page.tsx";
import type { CommunityPageSuccess } from "./community-page.model.ts";

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
  community: { displayName: "Night Shift", description: "After dark.", membershipMode: "open", memberCount: 1, followerCount: 1, rules: [] },
};
const session: SessionResolution = {
  status: "authenticated",
  userId: "account-one",
  personas: [{ personaId: "persona-one", displayName: "Harbor", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId, bindingSource: "first_membership" } }],
};
const engagementApi: CommunityEngagementApi = {
  readViewerState: async () => ({ membership: "member", following: true, followerCount: 1 }),
  resolveJoinAction: async () => ({ kind: "join" }),
  join: async () => ({ status: "joined", personaId: "persona-one" }),
  follow: async () => ({ following: true, followerCount: 1 }),
  unfollow: async () => ({ following: false, followerCount: 0 }),
};

function snapshot(postId: string): TextContentSubmissionV1 {
  return {
    submission_id: `submission-${postId}`,
    href: `/text-content-submissions/submission-${postId}`,
    surface: "text_post",
    status: "published",
    result: { decision: "allow", reason_code: null },
    published_resource: { kind: "post", post_id: postId, href: `/posts/${postId}` },
    review_ref: null,
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
  };
}

/** A server that publishes once per key and lets a test decide what the client hears. */
function server(reply: (attempt: number) => "ok" | "lost" | "offline" | "refuse" | Promise<"ok">) {
  const accepted = new Map<string, string>();
  const posts: CommunityPost[] = [];
  const dispatched: PendingSubmissionEnvelopeV1[] = [];
  const transport: TextSubmissionTransport = {
    read: async () => null,
    dispatch: async (envelope) => {
      dispatched.push(envelope);
      const answer = await reply(dispatched.length);
      if (answer === "offline") throw new AmbiguousTextSubmissionError("offline");
      if (answer === "refuse") throw new TextSubmissionServerRejectionError(403, "membership_required");
      let postId = accepted.get(envelope.idempotency_key);
      if (postId === undefined) {
        postId = `post-${accepted.size + 1}`;
        accepted.set(envelope.idempotency_key, postId);
        posts.push({ id: postId, title: "", body: "Hello world", score: 0, publishedAt: "2026-10-06T00:00:00Z", authorHandle: "Harbor" });
      }
      if (answer === "lost") throw new AmbiguousTextSubmissionError("acknowledgement lost");
      return snapshot(postId);
    },
  };
  return { transport, dispatched, accepted, loadThreads: async () => ({ posts: [...posts], nextCursor: null }) };
}

const disposers: Array<() => void> = [];
function render(view: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  disposers.push(solidRender(view, container));
  return container;
}
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function page(fake: ReturnType<typeof server>, resolveSession: () => Promise<SessionResolution> = async () => session) {
  return (
    <CommunityPage
      data={data}
      engagementApi={engagementApi}
      handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
      loadThreads={fake.loadThreads}
      pathSegment="night-shift"
      resolveOwnerSettingsAccess={async () => false}
      resolveSession={resolveSession}
      surfaceData={{ posts: [] }}
      textSubmissionTransport={fake.transport}
      viewerVoteClient={{ get_postsPostId: async (input) => JSON.parse(JSON.stringify({ post: { id: input.path.postId }, viewer_vote: null })) }}
    />
  );
}

const form = (container: HTMLElement) => container.querySelector<HTMLFormElement>("form[aria-label='Create a post']");
const pending = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-pending-text-post]");
const pendingStatus = (container: HTMLElement) => pending(container)?.getAttribute("data-pending-text-post-status") ?? null;
function button(scope: Element, name: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(candidate => candidate.textContent?.trim() === name);
  if (found === undefined) throw new Error(`No button named ${name}`);
  return found;
}

async function openComposer(container: HTMLElement) {
  await vi.waitFor(() => expect(container.querySelector("[data-community-post-slot]")).not.toBeNull());
  container.querySelector<HTMLButtonElement>("[data-community-post-slot]")!.click();
  await vi.waitFor(() => expect(form(container)).not.toBeNull());
}

async function post(container: HTMLElement, text: string) {
  await openComposer(container);
  const body = form(container)!.querySelector<HTMLTextAreaElement>("textarea[aria-label='Post']")!;
  body.value = text;
  body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await vi.waitFor(() => expect(button(form(container)!, "Post").disabled).toBe(false));
  button(form(container)!, "Post").click();
}

describe("community page text posting", () => {
  test("the composer sits in the page's side column and is not a full-screen form", async () => {
    const container = render(() => page(server(() => "ok")));
    await openComposer(container);
    const panel = container.querySelector("[data-text-post-panel]")!;
    expect(panel.closest("aside[aria-label='Community information']")).not.toBeNull();
    expect(container.querySelector("[data-create-post-form]")).toBeNull();
  });

  test("shows the post at once, then replaces it with the published post", async () => {
    let release: (value: "ok") => void = () => {};
    const fake = server(() => new Promise<"ok">(resolve => { release = resolve; }));
    const container = render(() => page(fake));
    await post(container, "Hello world");

    // Before the server has answered: the post is in the feed and the form is gone.
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("sending"));
    expect(pending(container)!.textContent).toContain("Hello world");
    expect(form(container)).toBeNull();
    expect(container.textContent).not.toContain("Check again");

    await vi.waitFor(() => expect(fake.dispatched).toHaveLength(1));
    release("ok");
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    const posts = container.querySelectorAll("[data-community-post]");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.getAttribute("data-community-post")).toBe("post-1");
  });

  test("confirms a post whose acknowledgement was lost without creating a second one", async () => {
    const fake = server(attempt => attempt === 1 ? "lost" : "ok");
    const container = render(() => page(fake));
    await post(container, "Hello world");
    await vi.waitFor(() => expect(pending(container)).not.toBeNull());
    expect(container.querySelector("[role='alert']")).toBeNull();
    await vi.waitFor(() => expect(container.querySelectorAll("[data-community-post]")).toHaveLength(1), { timeout: 4_000 });
    expect(pending(container)).toBeNull();
    expect(fake.dispatched).toHaveLength(2);
    expect(fake.dispatched[1]!.idempotency_key).toBe(fake.dispatched[0]!.idempotency_key);
    expect(fake.dispatched[1]!.body_sha256).toBe(fake.dispatched[0]!.body_sha256);
    expect(fake.accepted.size).toBe(1);
  });

  test("says a post is not sent yet without calling it failed, and recovers", async () => {
    let online = false;
    const fake = server(() => online ? "ok" : "offline");
    const container = render(() => page(fake));
    await post(container, "Hello world");
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("delayed"), { timeout: 6_000 });
    expect(pending(container)!.textContent).toContain("Not sent yet. Still trying.");
    expect(pending(container)!.querySelector("[role='alert']")).toBeNull();
    // The page is not held: the Post action is still there.
    expect(container.querySelector<HTMLButtonElement>("[data-community-post-slot]")!.disabled).toBe(false);
    online = true;
    button(pending(container)!, "Try now").click();
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    expect(fake.accepted.size).toBe(1);
  }, 10_000);

  test("keeps the text when the server refuses the post", async () => {
    const container = render(() => page(server(() => "refuse")));
    await post(container, "Keep these words");
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("rejected"));
    expect(pending(container)!.querySelector("[role='alert']")!.textContent).toContain("You can't post in this community right now.");
    button(pending(container)!, "Edit").click();
    await vi.waitFor(() => expect(form(container)).not.toBeNull());
    expect(form(container)!.querySelector<HTMLTextAreaElement>("textarea[aria-label='Post']")!.value).toBe("Keep these words");
    expect(pending(container)).toBeNull();
  });

  test("does not replace text already being written when a refused post is edited", async () => {
    const container = render(() => page(server(() => "refuse")));
    await post(container, "Refused words");
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("rejected"));
    await openComposer(container);
    const body = form(container)!.querySelector<HTMLTextAreaElement>("textarea[aria-label='Post']")!;
    body.value = "Something new";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(button(form(container)!, "Post").disabled).toBe(false));
    button(pending(container)!, "Edit").click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(form(container)!.querySelector<HTMLTextAreaElement>("textarea[aria-label='Post']")!.value).toBe("Something new");
    expect(pendingStatus(container)).toBe("rejected");
  });

  test("offers no way to resend an unconfirmed post as a new one", async () => {
    const container = render(() => page(server(() => "offline")));
    await post(container, "Hello world");
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("delayed"), { timeout: 6_000 });
    const actions = [...pending(container)!.querySelectorAll("button")].map(action => action.textContent?.trim());
    expect(actions).toEqual(["Try now", "Discard"]);
  }, 10_000);

  test("keeps sending after the author leaves the community, and clears on sign-out", async () => {
    let release: (value: "ok") => void = () => {};
    const fake = server(() => new Promise<"ok">(resolve => { release = resolve; }));
    const [state, setState] = createSignal<ApplicationSessionState>(session);
    const [onCommunity, setOnCommunity] = createSignal(true);
    const container = render(() => (
      <ApplicationSessionProvider state={state}>
        <TextSubmissionProvider transport={fake.transport}>
          <Show when={onCommunity()} fallback={<main data-elsewhere>Another page</main>}>
            {page(fake, async () => { const current = state(); return current === "anonymous" ? "anonymous" : session; })}
          </Show>
        </TextSubmissionProvider>
      </ApplicationSessionProvider>
    ));
    await post(container, "Hello world");
    await vi.waitFor(() => expect(fake.dispatched).toHaveLength(1));

    setOnCommunity(false);
    await vi.waitFor(() => expect(container.querySelector("[data-elsewhere]")).not.toBeNull());
    // The server answers while no community page is mounted.
    release("ok");
    await new Promise(resolve => setTimeout(resolve, 2_000));

    setOnCommunity(true);
    await vi.waitFor(() => expect(container.querySelectorAll("[data-community-post]")).toHaveLength(1));
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    expect(fake.accepted.size).toBe(1);

    // A second post is left unanswered, then the account signs out.
    await post(container, "Only mine to see");
    await vi.waitFor(() => expect(pending(container)).not.toBeNull());
    setState("anonymous");
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    setOnCommunity(false);
    setOnCommunity(true);
    await vi.waitFor(() => expect(container.querySelector("h1")).not.toBeNull());
    expect(container.textContent).not.toContain("Only mine to see");
  });
});
