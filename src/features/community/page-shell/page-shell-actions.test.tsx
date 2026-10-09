/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { screen, waitFor, within } from "storybook/test";
import { CommunityFeedSort } from "./community-feed-sort.tsx";
import { userEvent } from "@testing-library/user-event";
import { createRoot, createSignal } from "solid-js";
import { beforeAll, afterAll, afterEach, describe, expect, test, vi } from "vitest";

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

  test("a member gets Post in the header with passive membership and no feed control row", () => {
    const post = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined onCreatePost={post} />);
    const group = container.querySelector("[data-community-actions-reserved]")!;
    expect(group.querySelectorAll("button")).toHaveLength(1);
    group.querySelector<HTMLButtonElement>("button")!.click();
    expect(post).toHaveBeenCalledOnce();
    expect(group.textContent).toBe("Post");
    expect(container.querySelector("[data-community-persona-reserved]")).toBeNull();
    expect(container.querySelector("main button")).toBeNull();
    expect(container.querySelector("[data-community-membership-status]")?.className).not.toContain("invisible");
  });

  test.each(["pending", "failed"])("a %s authority read never exposes a stale member's Post", (state) => {
    const post = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined onCreatePost={post} authorityPending={state === "pending"} viewerUnknown={state === "failed"} />);
    expect(container.querySelector("[data-community-post-slot]")).toBeNull();
    expect(container.querySelectorAll("[data-community-actions-reserved] button")).toHaveLength(2);
    expect(container.querySelector("[data-community-membership-status]")?.className).toContain("invisible");
    expect(post).not.toHaveBeenCalled();
  });

  test("a follower can unfollow but cannot post even when a host supplies a callback", () => {
    const unfollow = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined={false} onFollowToggle={unfollow} onCreatePost={() => undefined} />);
    const follow = container.querySelector<HTMLButtonElement>("[data-community-follow-slot]")!;
    expect(follow.getAttribute("aria-label")).toBe("Unfollow this community");
    expect(follow.disabled).toBe(false);
    follow.click();
    expect(unfollow).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-community-post-slot]")).toBeNull();
  });

  test.each(["Request pending", "Unavailable"])("%s is passive while follow remains actionable", (label) => {
    const container = render(() => <CommunityPageShell community={community} following={false} joined={false} joinDisabled joinLabel={label} />);
    const membership = container.querySelector("[data-community-membership-slot]")!;
    expect(membership.getAttribute("role")).toBe("status");
    expect(membership.textContent).toBe(label);
    expect(membership.tagName).not.toBe("BUTTON");
    expect(container.querySelector<HTMLButtonElement>("[data-community-follow-slot]")?.disabled).toBe(false);
  });

  test("exposes the existing Boost entry point on community songs only", async () => {
    const container = render(() => (
      <CommunityPageShell
        community={{ ...community, id: "community-1" }}
        following={false}
        joined={false}
        feed={() => ({ kind: "ready", posts: [
          { id: "song-1", title: "Practice song", body: "", kind: "song", score: 0, publishedAt: "2026-09-24T08:00:00.000Z" },
          { id: "text-1", title: "Discussion", body: "Notes", kind: "text", score: 0, publishedAt: "2026-09-24T08:00:00.000Z" },
        ] })}
      />
    ));

    const song = container.querySelector('[data-community-post="song-1"]');
    const text = container.querySelector('[data-community-post="text-1"]');
    const songActions = [...song!.querySelectorAll("button")].find(button => button.textContent?.trim() === "Song actions");
    expect(songActions).toBeDefined();
    expect([...text!.querySelectorAll("button")].some(button => button.textContent?.trim() === "Song actions")).toBe(false);

    await userEvent.setup().click(songActions!);
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent?.trim() === "Boost")).toBe(true));
  });
});


describe("community desktop sort dismissal", () => {
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  beforeAll(() => Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
  afterAll(() => {
    if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
  test("selecting the current sort closes the menu and returns focus", async () => {
    const changed = vi.fn();
    const container = render(() => <CommunityFeedSort value="Best" onChange={changed} />);
    const user = userEvent.setup();
    const trigger = within(container).getAllByRole("button", { name: "Sort community feed" })[0]!;
    await user.click(trigger);
    const current = await screen.findByRole("menuitemradio", { name: "Best" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    await user.click(current);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(changed).not.toHaveBeenCalled();
  });

  test("keyboard selection changes the sort and closes on repeated selection", async () => {
    const changed = vi.fn();
    const container = render(() => {
      const [value, setValue] = createSignal("Best");
      return <CommunityFeedSort value={value()} onChange={next => { setValue(next); changed(next); }} />;
    });
    const user = userEvent.setup();
    const trigger = within(container).getAllByRole("button", { name: "Sort community feed" })[0]!;
    await user.click(trigger);
    const next = await screen.findByRole("menuitemradio", { name: "New" });
    next.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(changed).toHaveBeenCalledExactlyOnceWith("New");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.click(trigger);
    const current = await screen.findByRole("menuitemradio", { name: "New" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    await user.click(current);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});


describe("community feed thread links", () => {
  test("links text and song IDs while keeping supplied actions outside the link", async () => {
    const vote = vi.fn();
    const container = render(() => <CommunityPageShell community={{ ...community, posts: [
      { id: "text:one", title: "A full discussion", body: "Open the full thread.", score: 0, publishedAt: "2026-10-08" },
      { id: "song-one", kind: "song", title: "An original song", body: "Recording notes.", score: 0, publishedAt: "2026-10-08" },
    ] }} following={false} joined={false}
      renderPost={(_post, card) => card(<button type="button" onClick={vote}>Vote fixture</button>)} />);
    expect(within(container).getByRole("link", { name: "A full discussion" }).getAttribute("href"))
      .toBe("/post/text%3Aone");
    expect(within(container).getByRole("link", { name: "A full discussion" }).getAttribute("rel")).toBe("external");
    expect(within(container).getByRole("link", { name: "An original song" }).getAttribute("href"))
      .toBe("/post/song-one");
    const button = within(container).getAllByRole("button", { name: "Vote fixture" })[0]!;
    expect(button.closest("a")).toBeNull();
    await userEvent.setup().click(button);
    expect(vote).toHaveBeenCalledOnce();
    expect(within(container).getByRole("button", { name: "Play An original song" }).closest("a")).toBeNull();
  });
});
