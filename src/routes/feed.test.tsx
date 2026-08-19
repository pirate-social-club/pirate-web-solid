import { afterEach, describe, expect, test } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import FeedRoute from "./feed.tsx";
import { publicFeedReviewPage } from "../features/posts/feed/public-feed-fixtures.ts";

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
  document.head.replaceChildren();
});

describe("thread feed route", () => {
  test("renders the card feed at /feed while root remains video-owned", () => {
    const container = render(() => (
      <FeedRoute resolveSession={async () => "anonymous"} publicData={publicFeedReviewPage} />
    ));

    expect(container.querySelector("[data-route-path='/feed']")).not.toBeNull();
    expect(container.querySelector("[data-feed-state='ready']")).not.toBeNull();
    expect(container.textContent).toContain("A sovereign town square");
  });
});
