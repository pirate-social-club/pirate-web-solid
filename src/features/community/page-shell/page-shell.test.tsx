import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CommunityPageShell } from "./page-shell";
import type { CommunityData } from "./page-shell-model";

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

const community: CommunityData = {
  name: "Ella Alexandra",
  handle: "c/ellaalexandra",
  description: "Fan club for Ella Alexandra",
  members: 21,
  followers: 25,
  bannerSrc: "/community-banner.png",
  videoFeedEnabled: true,
  gateMode: "any",
  gates: [{ label: "Unique human proof", gateType: "unique_human", acceptedProviders: ["self", "zkpassport"], status: "unknown" }],
  owner: { displayName: "ellaalexandra.pirate", handle: "ellaalexandra.pirate", role: "owner" },
  rules: [{ title: "Be constructive", body: "Keep the conversation useful.", position: 1 }],
  posts: [{
    authorHandle: "ellaalexandra.pirate",
    authorName: "Ella Alexandra",
    body: "A community post with media.",
    commentCount: 5,
    id: "post-1",
    mediaSrc: "/community-post.png",
    publishedAt: "2026-08-19",
    publishedLabel: "2w",
    score: 24,
    title: "Gimme that girl talk",
  }],
};

describe("CommunityPageShell", () => {
  test("renders the reference community composition and rich post card", () => {
    const container = render(() => (
      <CommunityPageShell community={community} following={false} joined={false} showCreatePost />
    ));

    expect(container.querySelector("[data-community-page]")).not.toBeNull();
    expect(container.querySelector("[data-community-post-id='post-1']")).not.toBeNull();
    expect(container.textContent).toContain("Ella Alexandra");
    expect(container.textContent).toContain("Watch");
    expect(container.textContent).toContain("Threads");
    expect(container.textContent).toContain("Gimme that girl talk");
    expect(container.textContent).toContain("ellaalexandra.pirate");
    expect(container.textContent).toContain("Owner");
    expect(container.textContent).toContain("Self.xyz ID proof");
    expect(container.textContent).toContain("ZKPassport proof");
    expect(container.textContent).toContain("Community rules");
    expect(container.querySelectorAll("details")).toHaveLength(2);
  });

  test("emits surface and post actions", () => {
    const onSurfaceChange = vi.fn();
    const onPostOpen = vi.fn();
    const container = render(() => (
      <CommunityPageShell
        community={community}
        following={false}
        joined={true}
        onPostOpen={onPostOpen}
        onSurfaceChange={onSurfaceChange}
        showCreatePost
      />
    ));

    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find(button => button.textContent === "Watch")?.click();
    buttons.find(button => button.textContent?.includes("Gimme that girl talk"))?.click();

    expect(onSurfaceChange).toHaveBeenCalledWith("videos");
    expect(onPostOpen).toHaveBeenCalledWith("post-1");
  });
});
