/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { screen, waitFor, within } from "storybook/test";
import { CommunityFeedSort } from "./community-feed-sort.tsx";
import { shareCommunityLink } from "./community-more-menu.tsx";
import { userEvent } from "@testing-library/user-event";
import { createRoot, createSignal } from "solid-js";
import { beforeAll, afterAll, afterEach, describe, expect, onTestFinished, test, vi } from "vitest";

import type { CommunityData, CommunityPost } from "./page-shell-model.ts";
import { CommunityPageShell } from "./page-shell.tsx";
import { RewardServiceAvailabilityContext } from "../../rewards/reward-service-availability.tsx";

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

  test("a follower who has not joined gets only Join, across the row, and cannot post", () => {
    const join = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined={false} onJoin={join} onFollowToggle={() => undefined} onCreatePost={() => undefined} />);
    const group = container.querySelector("[data-community-actions-reserved]");
    if (group === null) throw new Error("Expected the action group");
    expect(group.querySelector("[data-community-follow-slot]")).toBeNull();
    const membership = group.querySelector<HTMLButtonElement>("[data-community-membership-slot]");
    if (membership === null) throw new Error("Expected the Join slot");
    expect(group.querySelectorAll("button")).toHaveLength(1);
    expect(membership.textContent).toBe("Join");
    expect(membership.className).toContain("col-span-2");
    membership.click();
    expect(join).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-community-post-slot]")).toBeNull();
  });

  test.each([
    ["Request to join", false, null],
    ["Verify to join", false, null],
    ["Request pending", true, "status"],
  ] as const)("a follower keeps the membership-mode label %s across the row", (label, disabled, role) => {
    const container = render(() => <CommunityPageShell community={community} following joined={false} joinLabel={label} joinDisabled={disabled} />);
    const slot = container.querySelector<HTMLElement>("[data-community-membership-slot]");
    expect(slot?.textContent).toBe(label);
    expect(slot?.getAttribute("role")).toBe(role);
    expect(slot?.className).toContain("col-span-2");
    expect(container.querySelector("[data-community-follow-slot]")).toBeNull();
  });

  test("an account that cannot join keeps its follow control as its only action", () => {
    const container = render(() => <CommunityPageShell community={community} following joined={false} canJoin={false} />);
    expect(container.querySelector("[data-community-follow-slot]")?.textContent).toBe("Following");
    expect(container.querySelector("[data-community-membership-slot]")).toBeNull();
  });

  test("the Post command is text only", () => {
    const container = render(() => <CommunityPageShell community={community} following joined onCreatePost={() => undefined} />);
    const post = container.querySelector("[data-community-post-slot]");
    expect(post?.textContent).toBe("Post");
    expect(post?.querySelector("svg")).toBeNull();
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
      <RewardServiceAvailabilityContext value={() => true}>
      <CommunityPageShell
        community={{ ...community, id: "community-1" }}
        following={false}
        joined={false}
        feed={() => ({ kind: "ready", posts: [
          { id: "song-1", title: "Practice song", body: "", kind: "song", score: 0, publishedAt: "2026-09-24T08:00:00.000Z" },
          { id: "text-1", title: "Discussion", body: "Notes", kind: "text", score: 0, publishedAt: "2026-09-24T08:00:00.000Z" },
        ] })}
      />
      </RewardServiceAvailabilityContext>
    ));

    const song = container.querySelector<HTMLElement>('[data-community-post="song-1"]');
    const text = container.querySelector<HTMLElement>('[data-community-post="text-1"]');
    if (song === null || text === null) throw new Error("Expected both cards");
    // Available rewards add Boost to the song's overflow menu.
    const songActions = within(song).getByRole("button", { name: "Post options" });
    expect(within(text).queryByRole("button", { name: "Post options" })).toBeNull();

    await userEvent.setup().click(songActions);
    await vi.waitFor(() => expect([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent?.trim() === "Boost")).toBe(true));
  });
});


describe("the banner's More menu", () => {
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  beforeAll(() => Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
  afterAll(() => {
    if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
    else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  function trigger(container: HTMLElement, kind: "menu" | "sheet"): HTMLElement {
    const element = container.querySelector<HTMLElement>(`[data-community-more="${kind}"]`);
    if (element === null) throw new Error(`Expected the More ${kind} trigger`);
    return element;
  }

  async function openMenu(container: HTMLElement): Promise<string[]> {
    await userEvent.setup().click(trigger(container, "menu"));
    const menu = await screen.findByRole("menu");
    return [...menu.querySelectorAll("[role='menuitem']")].map(item => item.textContent?.trim() ?? "");
  }

  test.each([
    ["a visitor", { following: false, joined: false }, ["Share"]],
    ["a follower", { following: true, joined: false }, ["Share", "Unfollow"]],
    ["a member", { following: true, joined: true }, ["Share"]],
    ["a managing member", { following: true, joined: true, onManage: () => undefined }, ["Share", "Manage"]],
    ["a follower whose read is pending", { following: true, joined: false, authorityPending: true }, ["Share"]],
  ] as const)("is always there and holds the rows for %s", async (_viewer, viewer, rows) => {
    const container = render(() => <CommunityPageShell community={community} onFollowToggle={() => undefined} {...viewer} />);
    expect(trigger(container, "menu").getAttribute("aria-label")).toBe("More community options");
    expect(trigger(container, "sheet").getAttribute("aria-label")).toBe("More community options");
    expect(await openMenu(container)).toEqual(rows);
  });

  test("reports management authority on its triggers without being opened", () => {
    const pending = render(() => <CommunityPageShell community={community} following={false} joined={false} managePending />);
    expect(trigger(pending, "menu").getAttribute("data-community-manage")).toBe("pending");
    const available = render(() => <CommunityPageShell community={community} following joined onManage={() => undefined} />);
    expect(trigger(available, "menu").getAttribute("data-community-manage")).toBe("available");
    const none = render(() => <CommunityPageShell community={community} following={false} joined={false} />);
    expect(trigger(none, "menu").hasAttribute("data-community-manage")).toBe(false);
  });

  test("Unfollow uses the follow toggle once", async () => {
    const toggle = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined={false} onFollowToggle={toggle} />);
    await openMenu(container);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Unfollow" }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  test("Manage calls the host's management entry", async () => {
    const manage = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined onManage={manage} />);
    await openMenu(container);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Manage" }));
    expect(manage).toHaveBeenCalledOnce();
  });

  test("Share hands the community address to the platform share sheet", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    onTestFinished(() => { Reflect.deleteProperty(navigator, "share"); });
    const container = render(() => <CommunityPageShell community={community} following={false} joined={false} shareUrl="https://pirate.sc/c/tameimpala" />);
    await openMenu(container);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledExactlyOnceWith({ title: "Tame Impala", url: "https://pirate.sc/c/tameimpala" }));
  });

  test("Share copies the address when the browser has no share sheet", async () => {
    const writeText = vi.fn(async () => undefined);
    const copied = await shareCommunityLink("https://pirate.sc/c/tameimpala", "Tame Impala", { clipboard: { writeText } });
    expect(copied).toBe("copied");
    expect(writeText).toHaveBeenCalledExactlyOnceWith("https://pirate.sc/c/tameimpala");
  });

  test("a dismissed share sheet neither copies nor reports a failure", async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => { throw new DOMException("dismissed", "AbortError"); });
    const outcome = await shareCommunityLink("https://pirate.sc/c/tameimpala", "Tame Impala", { share, clipboard: { writeText } });
    expect(outcome).toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  test("the phone sheet holds the same rows as plain buttons", async () => {
    const toggle = vi.fn();
    const container = render(() => <CommunityPageShell community={community} following joined={false} onFollowToggle={toggle} onManage={() => undefined} />);
    await userEvent.setup().click(trigger(container, "sheet"));
    const sheet = await screen.findByRole("dialog", { name: "More community options" });
    const rows = [...sheet.querySelectorAll<HTMLButtonElement>("[data-community-more-action]")];
    expect(rows.map(row => row.textContent)).toEqual(["Share", "Unfollow", "Manage"]);
    expect(rows[0]?.className).toContain("h-14");
    expect(rows[1]?.className).toContain("border-t");
    rows[1]?.click();
    expect(toggle).toHaveBeenCalledOnce();
  });
});

describe("the community header and About", () => {
  test("the phone header carries no description and About states the rules under Rules", () => {
    const container = render(() => <CommunityPageShell community={{ ...community, membershipMode: "open", rules: [{ title: "Be kind", body: "No personal attacks.", position: 1 }] }} following={false} joined={false} />);
    const overview = container.querySelector("[aria-label='Community overview']");
    expect(overview?.textContent).not.toContain(community.description);
    const about = container.querySelector("[data-community-about]");
    expect(about?.textContent).toContain("Anyone can join.");
    expect(about?.textContent).toContain("Rules");
    expect(about?.textContent).not.toContain("Community rules");
  });

  test("About is a phone tab only; desktop keeps Feed and Songs at their own width", () => {
    const container = render(() => <CommunityPageShell community={community} following={false} joined={false} />);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>("[data-community-tabs] button")];
    expect(tabs.map(tab => tab.textContent)).toEqual(["Feed", "Songs", "About"]);
    expect(tabs[2]?.className).toContain("md:hidden");
    expect(tabs[0]?.className).toContain("md:px-4");
    expect(container.querySelector("[data-community-tabs] [style*='grid-template-columns']")).toBeNull();
  });

  test("the banner darkens only a photo cover", () => {
    const plain = render(() => <CommunityPageShell community={community} following={false} joined={false} />);
    expect(plain.querySelector("[data-community-banner-scrim]")).toBeNull();
    const photo = render(() => <CommunityPageShell community={{ ...community, bannerSrc: "/banner.jpg" }} following={false} joined={false} />);
    expect(photo.querySelector("[data-community-banner-scrim]")).not.toBeNull();
  });

  test("the banner places the host's profile control after More", () => {
    const container = render(() => <CommunityPageShell community={community} following joined profileControl={<button type="button" data-test-profile>H</button>} />);
    const group = container.querySelector("[data-community-banner-actions]");
    const children = [...(group?.children ?? [])];
    const more = children.findIndex(child => child.querySelector("[data-community-more]") !== null);
    const profile = children.findIndex(child => child.hasAttribute("data-test-profile"));
    expect(more).toBeGreaterThanOrEqual(0);
    expect(profile).toBe(more + 1);
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
  test.each(["", "   "])("names an untitled text link from its body (title: %j)", (title) => {
    const body = "An untitled discussion.\n  More context.";
    const container = render(() => <CommunityPageShell community={{ ...community, posts: [
      { id: "untitled", title, body, score: 0, publishedAt: "2026-10-09" },
    ] }} following={false} joined={false} />);
    const link = within(container).getByRole("link", { name: "An untitled discussion. More context." });
    expect(link.getAttribute("href")).toBe("/post/untitled");
    expect(link.getAttribute("rel")).toBe("external");
    expect(container.textContent).toContain(body);
  });

  test("keeps an empty post link named and limits long body names", () => {
    const container = render(() => <CommunityPageShell community={{ ...community, posts: [
      { id: "empty", title: "", body: " \n ", score: 0, publishedAt: "2026-10-09" },
      { id: "long", title: "", body: "A".repeat(200), score: 0, publishedAt: "2026-10-09" },
    ] }} following={false} joined={false} />);
    expect(within(container).getByRole("link", { name: "Open post" }).getAttribute("href")).toBe("/post/empty");
    expect(within(container).getByRole("link", { name: "A".repeat(120) }).getAttribute("href")).toBe("/post/long");
  });

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

  test("a video post shows its caption link and a framed player above the link overlay, with no title heading", () => {
    const container = render(() => <CommunityPageShell community={{ ...community, posts: [
      { id: "video-one", kind: "video", title: "video", body: "Late-night loop, take two.", score: 0, publishedAt: "2026-10-08",
        mediaTitle: "Harbor Lights", video: { playback: "pending", thumbnail: "pending" } },
      { id: "video-two", kind: "video", title: "video", body: "", score: 0, publishedAt: "2026-10-08",
        video: { playback: "unavailable", thumbnail: "unavailable" } },
    ] }} following={false} joined={false} />);
    expect(within(container).getByRole("link", { name: "Late-night loop, take two." }).getAttribute("href")).toBe("/post/video-one");
    expect(within(container).getByRole("link", { name: "Open video post" }).getAttribute("href")).toBe("/post/video-two");
    expect(within(container).queryByRole("heading", { name: "video" })).toBeNull();
    const frame = container.querySelector('[data-community-video="video-one"]');
    expect(frame?.className).toContain("z-10");
    expect(frame?.className).toContain("aspect-[9/16]");
    expect(frame?.textContent).toContain("Playback is being prepared.");
    expect(frame?.textContent).toContain("Harbor Lights");
    expect(container.querySelector('[data-community-post="video-one"] video')).toBeNull();
  });

  test("a video card cannot exist without its delivery state", () => {
    const base = { id: "v", title: "video", body: "", score: 0, publishedAt: "2026-10-08" };
    // @ts-expect-error A video post must carry its delivery state.
    const missing: CommunityPost = { ...base, kind: "video" };
    // @ts-expect-error Only a video post carries a delivery state.
    const misplaced: CommunityPost = { ...base, kind: "song", video: { playback: "ready", thumbnail: "ready" } };
    const complete: CommunityPost = { ...base, kind: "video", video: { playback: "pending", thumbnail: "pending" } };
    expect([missing.kind, misplaced.kind, complete.kind]).toEqual(["video", "song", "video"]);
  });

  test("the author row draws the compact age and a 44px overflow target that does not grow the row", () => {
    const container = render(() => <CommunityPageShell community={{ ...community, id: "community-1", posts: [
      { id: "song-one", kind: "song", title: "An original song", body: "", score: 0, publishedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
    ] }} following={false} joined={false}
      renderPost={(_post, card) => card(undefined, [{ label: "Report", run: () => {} }])} />);
    const card = container.querySelector<HTMLElement>('[data-community-post="song-one"]');
    if (card === null) throw new Error("Expected the song card");
    expect(card.querySelector("time")?.textContent).toBe("2h");
    const trigger = within(card).getByRole("button", { name: "Post options" });
    expect(trigger.className).toContain("size-11");
    expect(trigger.className).toContain("-my-2.5");
  });
});
