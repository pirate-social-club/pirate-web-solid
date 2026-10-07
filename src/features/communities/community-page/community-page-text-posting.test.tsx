/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { Show, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { clearSession, type AuthenticatedSession, type SessionResolution } from "../../../api/session.ts";
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
const session: AuthenticatedSession = {
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
function server(reply: (attempt: number) => "ok" | "lost" | "offline" | "refuse" | "signed_out" | Promise<"ok">) {
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
      if (answer === "signed_out") throw new TextSubmissionAuthenticationRequiredError();
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

function page(
  fake: ReturnType<typeof server>,
  resolveSession: () => Promise<SessionResolution> = async () => session,
  entry: { readonly composeText?: boolean; readonly clear?: () => void } = {},
) {
  return (
    <CommunityPage
      clearVideoSongIntent={entry.clear}
      composeText={entry.composeText}
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
  test("the composer replaces the main feed and stays out of the sidebar", async () => {
    const container = render(() => page(server(() => "ok")));
    await openComposer(container);
    const panel = container.querySelector("[data-text-post-panel]")!;
    expect(panel.closest("main[aria-label='Create a post']")).not.toBeNull();
    expect(panel.closest("aside")).toBeNull();
    expect(container.querySelector("main[aria-label='Community feed']")).toBeNull();
    expect(container.querySelector("[data-community-tabs]")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector("[data-create-post-form]")).toBeNull();
  });

  test("an entry that asks for the text composer opens it once and drops its marker", async () => {
    const clear = vi.fn();
    const container = render(() => page(server(() => "ok"), async () => session, { composeText: true, clear }));
    await vi.waitFor(() => expect(form(container)).not.toBeNull());
    expect(container.querySelector("[data-text-post-panel]")).not.toBeNull();
    expect(container.querySelector("[data-create-post-form]")).toBeNull();
    await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
    // Closing it is the author's decision; the entry does not reopen it.
    form(container)!.querySelector<HTMLButtonElement>("button[aria-label='Cancel']")!.click();
    await vi.waitFor(() => expect(form(container)).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(form(container)).toBeNull();
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

  test("a post the server published but never acknowledged is not called unsent and cannot be dismissed", async () => {
    // Every answer is lost, but the very first request was accepted.
    let answers: "lost" | "ok" = "lost";
    const fake = server(() => answers);
    const container = render(() => page(fake));
    await post(container, "Hello world");
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("delayed"), { timeout: 6_000 });
    expect(fake.accepted.size).toBe(1);

    // The message makes no claim about whether the post was sent.
    const said = pending(container)!.textContent ?? "";
    expect(said).toContain("Taking longer than usual. Still trying.");
    expect(said).not.toMatch(/not sent|failed|couldn.t/iu);
    expect(pending(container)!.querySelector("[role='alert']")).toBeNull();

    // Nothing offers to remove or resend it: either would leave the published
    // post in place and invite a second one.
    const actions = [...pending(container)!.querySelectorAll("button")].map(action => action.textContent?.trim());
    expect(actions).toEqual(["Try now"]);

    // Recovery does not depend on the composer. Opening and closing it changes nothing.
    await openComposer(container);
    form(container)!.querySelector<HTMLButtonElement>("button[aria-label='Cancel']")!.click();
    await vi.waitFor(() => expect(form(container)).toBeNull());
    expect(pendingStatus(container)).toBe("delayed");
    // The page is not held either.
    expect(container.querySelector<HTMLButtonElement>("[data-community-post-slot]")!.disabled).toBe(false);

    answers = "ok";
    button(pending(container)!, "Try now").click();
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    expect(container.querySelectorAll("[data-community-post]")).toHaveLength(1);
    expect(fake.accepted.size).toBe(1);
    expect(new Set(fake.dispatched.map(envelope => envelope.idempotency_key)).size).toBe(1);
  }, 12_000);

  test("holds a post when the session has expired and sends the same request after signing in again", async () => {
    let signedIn = false;
    const fake = server(() => signedIn ? "ok" : "signed_out");
    const container = render(() => page(fake));
    const prompts: Array<(authenticated: boolean) => void> = [];
    const onPrompt = (event: Event) => {
      // SAFETY: requestGlobalSignInCompletion always dispatches this detail shape.
      const detail = (event as CustomEvent<{ complete: (authenticated: boolean) => void }>).detail;
      prompts.push(detail.complete);
    };
    window.addEventListener("pirate:connect", onPrompt);
    try {
      await post(container, "Hello world");
      await vi.waitFor(() => expect(pendingStatus(container)).toBe("sign_in_required"));
      expect(pending(container)!.textContent).toContain("Sign in again to finish posting.");
      expect(pending(container)!.textContent).not.toContain("Still trying");

      // Delivery is paused, not retried on a timer.
      await new Promise(resolve => setTimeout(resolve, 2_500));
      expect(fake.dispatched).toHaveLength(1);
      expect(pendingStatus(container)).toBe("sign_in_required");

      button(pending(container)!, "Sign in").click();
      await vi.waitFor(() => expect(prompts).toHaveLength(1));
      signedIn = true;
      prompts[0]!(true);
      await vi.waitFor(() => expect(pending(container)).toBeNull());
      expect(container.querySelectorAll("[data-community-post]")).toHaveLength(1);
      // The held request was sent again unchanged.
      expect(fake.dispatched).toHaveLength(2);
      expect(fake.dispatched[1]!.idempotency_key).toBe(fake.dispatched[0]!.idempotency_key);
      expect(fake.dispatched[1]!.body_sha256).toBe(fake.dispatched[0]!.body_sha256);
    } finally {
      window.removeEventListener("pirate:connect", onPrompt);
    }
  }, 12_000);

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
    expect(pending(container)).toBeNull();
    form(container)!.querySelector<HTMLButtonElement>("button[aria-label='Cancel']")!.click();
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("rejected"));
    button(pending(container)!, "Edit").click();
    await vi.waitFor(() => expect(form(container)).not.toBeNull());
    expect(form(container)!.querySelector<HTMLTextAreaElement>("textarea[aria-label='Post']")!.value).toBe("Something new");
    form(container)!.querySelector<HTMLButtonElement>("button[aria-label='Cancel']")!.click();
    await vi.waitFor(() => expect(pendingStatus(container)).toBe("rejected"));
  });


  test("keeps sending after the author leaves the community, holds on expiry, and clears on sign-out", async () => {
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

    // A second post is left unanswered, then the session ends without a sign-out.
    await post(container, "Only mine to see");
    await vi.waitFor(() => expect(fake.dispatched).toHaveLength(2));
    setState("anonymous");
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    setOnCommunity(false);
    setOnCommunity(true);
    await vi.waitFor(() => expect(container.querySelector("h1")).not.toBeNull());
    expect(container.textContent).not.toContain("Only mine to see");

    // Another account signing in drops the held post for good.
    setState({ status: "authenticated", userId: "account-two" });
    await new Promise(resolve => setTimeout(resolve, 20));
    setState(session);
    setOnCommunity(false);
    setOnCommunity(true);
    await vi.waitFor(() => expect(container.querySelector("[data-community-post-slot]")).not.toBeNull());
    expect(container.textContent).not.toContain("Only mine to see");
    expect(fake.accepted.size).toBe(1);

    // A third post is left unanswered and the author deliberately signs out.
    await post(container, "Left behind on purpose");
    await vi.waitFor(() => expect(fake.dispatched).toHaveLength(3));
    clearSession();
    setState("anonymous");
    await vi.waitFor(() => expect(pending(container)).toBeNull());
    // The same account signing back in does not bring it back or resend it.
    setState({ ...session });
    setOnCommunity(false);
    setOnCommunity(true);
    await vi.waitFor(() => expect(container.querySelector("[data-community-post-slot]")).not.toBeNull());
    await new Promise(resolve => setTimeout(resolve, 1_500));
    expect(container.textContent).not.toContain("Left behind on purpose");
    expect(fake.dispatched).toHaveLength(3);
  }, 15_000);
});
