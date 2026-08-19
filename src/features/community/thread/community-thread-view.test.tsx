import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import { communityThreadReviewPage } from "./community-thread-fixtures.ts";
import { CommunityThreadView } from "./community-thread-view.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
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

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("CommunityThreadView", () => {
  test("renders a linked-back root post and nested reusable comments", async () => {
    const container = render(() => <CommunityThreadView thread={communityThreadReviewPage} />);

    expect(container.querySelector("[data-community-thread-page]")).not.toBeNull();
    expect(container.querySelector("[data-community-post-id='review-community-thread-1']")).not.toBeNull();
    expect(container.querySelector("[data-community-comment-id='review-comment-1']")).not.toBeNull();
    expect(container.querySelector("[data-community-comment-id='review-comment-1-1']")).not.toBeNull();
    expect(container.textContent).toContain("deckhand");
    expect(container.querySelector('a[href="/c/tameimpala/threads"]')).not.toBeNull();
    expect(container.querySelector('[data-community-comment-composer]')).not.toBeNull();
    const collapsedTextarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Write a comment"]');
    expect(collapsedTextarea).not.toBeNull();
    expect(collapsedTextarea?.className).toContain("h-11");
    expect(container.textContent).not.toContain("Join the conversation");
    expect(container.textContent).not.toContain("Markdown formatting is supported.");

    const reply = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Reply");
    reply?.click();
    await Promise.resolve();

    expect(container.querySelector('textarea[aria-label="Write a reply"]')).not.toBeNull();
    expect(container.textContent).toContain("Replying to deckhand");
    expect(container.textContent).toContain("Cancel reply");
  });

  test("renders the locked and unavailable states without inventing comments", () => {
    const container = render(() => (
      <CommunityThreadView
        thread={{ ...communityThreadReviewPage, comments: [], commentsStatus: "unavailable" }}
      />
    ));

    expect(container.textContent).toContain("Comments are not available yet.");
    expect(container.querySelector("[data-community-comment-id]")).toBeNull();
  });

  test("posts a local fixture comment from the shared composer", async () => {
    const container = render(() => (
      <CommunityThreadView allowLocalCommentSubmit thread={communityThreadReviewPage} />
    ));
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Write a comment"]');
    expect(textarea).not.toBeNull();
    if (textarea === null) throw new Error("comment composer textarea missing");
    textarea.focus();
    await Promise.resolve();
    textarea.value = "A new thought for the listening guide.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.trim() === "Post");
    submit?.click();
    await Promise.resolve();

    expect(container.textContent).toContain("A new thought for the listening guide.");
  });
});
