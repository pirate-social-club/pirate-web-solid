/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import type { CommunityData } from "./page-shell-model.ts";
import { CommunityPageShell } from "./page-shell.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(ui, container);
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

const community: CommunityData = {
  name: "Tame Impala",
  handle: "c/tameimpala",
  description: "Albums, deep cuts, live sessions, and production talk.",
  members: 48_231,
  followers: 92_100,
  posts: [],
};

describe("community page shell header actions", () => {
  /**
   * The follow and membership slots share one labelled container. A label on a
   * container with no role is discarded by assistive technology and reported by
   * axe as aria-prohibited-attr, so the role is the assertion, not the label.
   */
  test("exposes the reserved action row as a named group", () => {
    const container = render(() => (
      <CommunityPageShell community={community} following={false} joined={false} />
    ));

    const row = container.querySelector("[data-community-actions-reserved]");
    expect(row).not.toBeNull();
    expect(row?.getAttribute("role")).toBe("group");
    expect(row?.getAttribute("aria-label")).toBe("Community actions");
  });

  test("does not render the action row for a read-only viewer", () => {
    const container = render(() => (
      <CommunityPageShell community={community} following={false} joined={false} readOnly />
    ));

    expect(container.querySelector("[data-community-actions-reserved]")).toBeNull();
  });
});
