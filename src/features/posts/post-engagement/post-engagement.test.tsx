import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PostEngagementTransport } from "./post-engagement-api.ts";
import { PostEngagement } from "./post-engagement.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: () => void = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find(candidate =>
    candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label,
  );
  if (!(match instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`);
  return match;
}

function transportFixture(createComment: PostEngagementTransport["createComment"]): PostEngagementTransport {
  return {
    createComment,
    createReply: vi.fn(),
    reportComment: vi.fn(),
    moderateCase: vi.fn(),
    castVote: vi.fn(async (postId, value) => ({ post_id: postId, value, upvote_count: value === 1 ? 4 : 3, downvote_count: 1 })),
    clearVote: vi.fn(async postId => ({ post_id: postId, value: 0 as const, upvote_count: 3, downvote_count: 1 })),
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("PostEngagement", () => {
  test("reuses the comment action key after an unconfirmed attempt", async () => {
    const createComment = vi.fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        submission_id: "submission-1",
        href: "/comments/comment-1",
        surface: "comment",
        status: "published",
        result: { decision: "allow", reason_code: null },
        published_resource: { kind: "comment", comment_id: "comment-1", href: "/comments/comment-1" },
        review_ref: null,
        created_at: "2026-08-22T00:00:00.000Z",
        updated_at: "2026-08-22T00:00:00.000Z",
      });
    window.scrollTo = vi.fn();
    render(() => <PostEngagement
      generateIdempotencyKey={() => "stable-comment-key"}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transportFixture(createComment)}
    />);

    button("Comments (0)").click();
    await vi.waitFor(() => expect(document.querySelector("textarea[aria-label='Write a comment']")).not.toBeNull());
    const textarea = document.querySelector("textarea[aria-label='Write a comment']");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("comment textarea not found");
    textarea.value = "A durable comment";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "A durable comment", inputType: "insertText" }));
    await vi.waitFor(() => expect(button("Post comment").disabled).toBe(false));
    button("Post comment").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Retrying will reuse the same action key"));

    button("Post comment").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-state='published']")?.textContent).toContain("A durable comment"));
    expect(createComment).toHaveBeenNthCalledWith(1, "post-1", "A durable comment", "stable-comment-key");
    expect(createComment).toHaveBeenNthCalledWith(2, "post-1", "A durable comment", "stable-comment-key");
    expect(button("Comments (1)")).toBeTruthy();
  });

  test("casts, changes, and clears a post vote without moderation", async () => {
    const transport = transportFixture(vi.fn());
    const keys = ["vote-up", "vote-down", "vote-clear"];
    render(() => <PostEngagement
      generateIdempotencyKey={() => keys.shift() ?? "unexpected"}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transport}
    />);

    button("Upvote").click();
    await vi.waitFor(() => expect(button("Upvote").getAttribute("aria-pressed")).toBe("true"));
    button("Downvote").click();
    await vi.waitFor(() => expect(button("Downvote").getAttribute("aria-pressed")).toBe("true"));
    button("Downvote").click();
    await vi.waitFor(() => expect(button("Downvote").getAttribute("aria-pressed")).toBe("false"));

    expect(transport.castVote).toHaveBeenNthCalledWith(1, "post-1", 1, "vote-up");
    expect(transport.castVote).toHaveBeenNthCalledWith(2, "post-1", -1, "vote-down");
    expect(transport.clearVote).toHaveBeenCalledWith("post-1", "vote-clear");
    expect(transport.moderateCase).not.toHaveBeenCalled();
  });

  test("retains a reported case reference and updates visible counts after moderation", async () => {
    window.scrollTo = vi.fn();
    const transport = {
      ...transportFixture(vi.fn()),
      reportComment: vi.fn(async () => ({ report_id: "report-1", case_ref: "case-1", status: "open" as const })),
      moderateCase: vi.fn(async () => ({
        action_id: "action-1",
        case_ref: "case-1",
        action: "hide" as const,
        target_status: "hidden" as const,
      })),
    };
    const keys = ["report-key", "moderation-key"];
    render(() => <PostEngagement
      canModerate
      generateIdempotencyKey={() => keys.shift() ?? "unexpected"}
      initialComments={[{
        id: "comment-1",
        submissionId: "submission-1",
        parentId: null,
        body: "Visible comment",
        depth: 0,
        replyCount: 0,
        state: "published",
        caseRef: null,
        href: "/comments/comment-1",
      }]}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 1, viewerVote: null }}
      transport={transport}
    />);

    button("Comments (1)").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-id='comment-1']")).not.toBeNull());
    expect([...document.querySelectorAll("button")].some(candidate => candidate.textContent?.trim() === "Hide")).toBe(false);
    button("Report").click();
    await vi.waitFor(() => expect(button("Hide")).toBeTruthy());
    expect(transport.reportComment).toHaveBeenCalledWith("comment-1", "spam", "report-key");

    button("Hide").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-state='hidden']")).not.toBeNull());
    expect(button("Comments (0)")).toBeTruthy();
    expect(transport.moderateCase).toHaveBeenCalledWith("case-1", "hide", "moderation-key");
  });
});
