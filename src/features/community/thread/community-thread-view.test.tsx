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
  test("renders a linked-back root post and nested reusable comments", () => {
    const container = render(() => <CommunityThreadView thread={communityThreadReviewPage} />);

    expect(container.querySelector("[data-community-thread-page]")).not.toBeNull();
    expect(container.querySelector("[data-community-post-id='review-community-thread-1']")).not.toBeNull();
    expect(container.querySelector("[data-community-comment-id='review-comment-1']")).not.toBeNull();
    expect(container.querySelector("[data-community-comment-id='review-comment-1-1']")).not.toBeNull();
    expect(container.textContent).toContain("Comments");
    expect(container.textContent).toContain("deckhand");
    expect(container.querySelector('a[href="/c/tameimpala/threads"]')).not.toBeNull();
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
});
