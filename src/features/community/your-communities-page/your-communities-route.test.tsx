import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import { YourCommunitiesRouteView } from "./your-communities-route.tsx";

const disposers: Array<() => void> = [];

Element.prototype.scrollIntoView = vi.fn();

function routeRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>("[data-route-path='/communities']");
  if (root === null) throw new Error("Communities route root was not rendered");
  return root;
}

/** The contextual composer is open when its one close control exists and no
 * raw community identifier input is offered. */
function contextualComposerOpen(): boolean {
  return document.body.querySelector("button[aria-label='Close composer']") !== null
    && document.body.querySelector("input[name='community-id']") === null;
}

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
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
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const routeLessMembership: AccountCommunityMembership = {
  object: "account_community_membership",
  community_id: "community-route-less",
  display_name: "Open Sea",
  resource_href: null,
  canonical_route: null,
  membership_status: "member",
  can_post: true,
};

const routedMembership: AccountCommunityMembership = {
  ...routeLessMembership,
  community_id: "community-routed",
  display_name: "Harbor",
  canonical_route: {
    family: "spaces",
    root_label: "harbor",
    root_label_display: "harbor",
    path_segment: "harbor",
    href: "/c/harbor",
    app_host: null,
  },
};

describe("YourCommunitiesRouteView", () => {
  test("ignores posting access that completes after sign-out", async () => {
    const [session, setSession] = createSignal<
      "anonymous" | { status: "authenticated"; userId: string }
    >({ status: "authenticated", userId: "account-one" });
    let finish = (_items: readonly AccountCommunityMembership[]) => {};
    const pending = new Promise<readonly AccountCommunityMembership[]>((resolve) => {
      finish = resolve;
    });
    const loadMemberships = vi.fn()
      .mockResolvedValueOnce([routeLessMembership])
      .mockReturnValueOnce(pending);
    const resolvePostingSession = vi.fn(async () => ({
      status: "authenticated" as const, userId: "account-one", personas: [],
    }));
    const container = render(() => <YourCommunitiesRouteView
      applicationSession={session} loadMemberships={loadMemberships}
      resolvePostingSession={resolvePostingSession}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    container.querySelector<HTMLButtonElement>("[data-post-community-id]")!.click();
    await vi.waitFor(() => expect(loadMemberships).toHaveBeenCalledTimes(2));
    setSession("anonymous");
    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to see your communities."));
    finish([routeLessMembership]);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvePostingSession).not.toHaveBeenCalled();
    expect(contextualComposerOpen()).toBe(false);
  });

  test("shows account-check failure without loading memberships or claiming sign-out", async () => {
    const loadMemberships = vi.fn();
    const container = render(() => <YourCommunitiesRouteView applicationSession={() => "failed"} loadMemberships={loadMemberships} />);
    await vi.waitFor(() => expect(container.textContent).toContain("We couldn't check your account"));
    expect(loadMemberships).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Sign in to see your communities.");
  });

  test("renders an anonymous sign-in state without loading private memberships", async () => {
    const loadMemberships = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => "anonymous"}
        loadMemberships={loadMemberships}
      />
    ));
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("anonymous"),
    );
    expect(loadMemberships).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Sign in to see your communities.");
  });

  test("offers route-less members a contextual composer after a fresh membership read", async () => {
    const loadMemberships = vi.fn(async () => [routeLessMembership]);
    const resolvePostingSession = vi.fn(async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
    }));
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={loadMemberships}
        resolvePostingSession={resolvePostingSession}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    expect(container.textContent).not.toContain("No public route");
    expect(
      container.querySelector(
        "#community-community-route-less button:not([data-post-community-id])",
      ),
    ).toBeNull();

    container
      .querySelector<HTMLButtonElement>("[data-post-community-id='community-route-less']")
      ?.click();
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
    expect(loadMemberships).toHaveBeenCalledTimes(2);
    expect(resolvePostingSession).toHaveBeenCalledOnce();
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
  });

  test("reports unavailable profiles and retries on the next Post click", async () => {
    let unavailable = true;
    const resolvePostingSession = vi.fn(async () => ({ status: "authenticated" as const,
      userId: "account-one", personas: [], personasUnavailable: unavailable ? true as const : undefined }));
    const container = render(() => <YourCommunitiesRouteView
      applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
      loadMemberships={async () => [routeLessMembership]} resolvePostingSession={resolvePostingSession} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    const post = () => container.querySelector<HTMLButtonElement>("[data-post-community-id]")!;
    post().click();
    await vi.waitFor(() => expect(container.textContent).toContain("couldn't load your community profiles"));
    expect(document.body.textContent).not.toContain("Choose a profile for this community before posting");
    expect(contextualComposerOpen()).toBe(false);
    unavailable = false;
    post().click();
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
    expect(resolvePostingSession).toHaveBeenCalledTimes(2);
  });

  test("does not offer unrelated or unbound personas in a route-less community", async () => {
    const persona = (personaId: string, communityId: string | null) => ({
      personaId, displayName: personaId, avatarRef: null, primaryPublicHandle: null,
      communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" as const },
    });
    const container = render(() => <YourCommunitiesRouteView
      applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
      loadMemberships={async () => [routeLessMembership]}
      resolvePostingSession={async () => ({ status: "authenticated", userId: "account-one", personas: [
        persona("persona-elsewhere", "another-community"), persona("persona-unbound", null),
      ] })}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    container.querySelector<HTMLButtonElement>("[data-post-community-id]")!.click();
    await vi.waitFor(() => expect(contextualComposerOpen()).toBe(true));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Choose a profile for this community before posting"));
    expect(document.body.textContent).not.toContain("persona-elsewhere");
    expect(document.body.textContent).not.toContain("persona-unbound");
  });

  test("fails closed when membership disappears before the composer opens", async () => {
    const loadMemberships = vi
      .fn()
      .mockResolvedValueOnce([routeLessMembership])
      .mockResolvedValueOnce([]);
    const resolvePostingSession = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={loadMemberships}
        resolvePostingSession={resolvePostingSession}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    container
      .querySelector<HTMLButtonElement>("[data-post-community-id='community-route-less']")
      ?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("no longer post"));
    expect(resolvePostingSession).not.toHaveBeenCalled();
    expect(contextualComposerOpen()).toBe(false);
  });

  test("reacts to hydration session transitions", async () => {
    const [session, setSession] = createSignal<
      "resolving" | { status: "authenticated"; userId: string }
    >("resolving");
    const loadMemberships = vi.fn(async () => [routeLessMembership]);
    const container = render(() => (
      <YourCommunitiesRouteView applicationSession={session} loadMemberships={loadMemberships} />
    ));
    expect(routeRoot(container).getAttribute("data-communities-state")).toBe("loading");
    setSession({ status: "authenticated", userId: "account-one" });
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("ready"),
    );
    expect(loadMemberships).toHaveBeenCalledOnce();
  });

  test("navigates only through a server-provided route", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={async () => [routedMembership]}
        navigate={navigate}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Harbor"));
    container.querySelector<HTMLButtonElement>("#community-community-routed button:not([data-post-community-id])")?.click();
    expect(navigate).toHaveBeenCalledWith("/c/harbor");
  });

  test("renders an explicit empty-membership state", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={async () => []}
      />
    ));
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("ready"),
    );
    expect(container.textContent).toContain("You aren't a member of a community yet.");
  });

  test("a preselected song offers only posting destinations and explains when there are none", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        initialVideoSong={{ postId: "song-post-id" }}
        loadMemberships={async () => []}
      />
    ));
    await vi.waitFor(() => expect(routeRoot(container).getAttribute("data-communities-state")).toBe("ready"));
    expect(container.querySelector("[data-post-community-id]")).toBeNull();
    expect(container.textContent).toContain("You don't have a community where you can post this video yet.");
    expect(container.textContent).toContain("Create community");
    // There is nothing to choose, so the page does not ask for a choice.
    expect(container.textContent).not.toContain("Choose a community to post it in.");
  });

  test("a preselected song opens video creation in the chosen destination", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        initialVideoSong={{ postId: "song-post-id" }}
        loadMemberships={async () => [routeLessMembership]}
        resolvePostingSession={async () => ({ status: "authenticated", userId: "account-one", personas: [] })}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("[data-post-community-id='community-route-less']")).not.toBeNull());
    container.querySelector<HTMLButtonElement>("[data-post-community-id='community-route-less']")!.click();
    await vi.waitFor(() => expect(container.querySelector("[data-create-video-overlay]")).not.toBeNull());
    expect(container.querySelector("input[name='community-id']")).toBeNull();
  });

  const signedIn = () => ({ status: "authenticated" as const, userId: "account-one" });
  const actionButtons = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>("[data-post-community-id]")];

  test("a pending song is named, its actions say which community, and the exits that lose it are gone", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={signedIn}
        initialVideoSong={{ postId: "song-post-id" }}
        loadMemberships={async () => [routedMembership, routeLessMembership]}
        readSongTitle={async () => "Cadence"}
      />
    ));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Post a video with “Cadence”"));
    expect(container.textContent).toContain("Choose a community to post it in.");
    const actions = actionButtons(container);
    expect(actions.map(action => action.getAttribute("aria-label"))).toEqual(["Post video in Harbor", "Post video in Open Sea"]);
    expect(actions.every(action => action.textContent?.trim() === "Post video")).toBe(true);
    expect([...container.querySelectorAll("button")].some(control => control.textContent === "Create community")).toBe(false);
    // A community with an address is only a name here: opening it would leave
    // the step and drop the song.
    expect(container.querySelector("#community-community-routed button:not([data-post-community-id])")).toBeNull();
  });

  test("a song whose title cannot be read is still named as this song", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={signedIn}
        initialVideoSong={{ postId: "song-post-id" }}
        loadMemberships={async () => [routedMembership]}
        readSongTitle={async () => { throw new Error("offline"); }}
      />
    ));
    await vi.waitFor(() => expect(actionButtons(container)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.querySelector("h1")?.textContent).toBe("Post a video with this song");
  });

  test("the tapped action shows it is working and the other communities wait", async () => {
    let release = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={signedIn}
        initialVideoSong={{ postId: "song-post-id" }}
        loadMemberships={async () => [routedMembership, routeLessMembership]}
        readSongTitle={async () => "Cadence"}
        resolvePostingSession={async () => {
          await held;
          return { status: "authenticated", userId: "account-one", personas: [] };
        }}
      />
    ));
    await vi.waitFor(() => expect(actionButtons(container)).toHaveLength(2));
    const [harbor, openSea] = actionButtons(container);
    if (harbor === undefined || openSea === undefined) throw new Error("both post actions should be rendered");
    expect(harbor.getAttribute("aria-busy")).not.toBe("true");
    harbor.click();
    await vi.waitFor(() => expect(harbor.getAttribute("aria-busy")).toBe("true"));
    expect(openSea.disabled).toBe(true);
    release();
    await vi.waitFor(() => expect(container.querySelector("[data-create-video-overlay]")).not.toBeNull());
  });

  test("without a pending song the page keeps its own title, Create action and generic post action", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={signedIn}
        loadMemberships={async () => [routedMembership]}
      />
    ));
    await vi.waitFor(() => expect(actionButtons(container)).toHaveLength(1));
    expect(container.querySelector("h1")?.textContent).toBe("Your communities");
    expect([...container.querySelectorAll("button")].some(control => control.textContent === "Create community")).toBe(true);
    const [action] = actionButtons(container);
    if (action === undefined) throw new Error("the post action should be rendered");
    expect(action.textContent?.trim()).toBe("Post here");
    expect(action.hasAttribute("aria-label")).toBe(false);
  });

  test("a failed membership load offers its own retry", async () => {
    let attempts = 0;
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={vi.fn(async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("offline");
          return [routedMembership];
        })}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("We couldn't load your Communities."));
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent === "Try again");
    expect(retry).toBeDefined();
    retry!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Harbor"));
  });

});
