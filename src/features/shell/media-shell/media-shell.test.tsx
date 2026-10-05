import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createEffect, createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ActivePersonaProvider, useActivePersonaStore } from "../../identity/active-persona-store.tsx";
import { ApplicationChrome } from "./media-shell";

const disposers: Array<() => void> = [];

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
  document.body.replaceChildren();
});

describe("Application navigation", () => {
  test("lets a community banner reach the top without the generic phone header", () => {
    const container = render(() => <ApplicationChrome hideMobileHeader mobileTitle="Community">Banner</ApplicationChrome>);
    expect(container.querySelector('button[aria-label="Open navigation"]')).toBeNull();
    expect(container.querySelector('nav[aria-label="Primary navigation"]')).not.toBeNull();
    expect(container.textContent).toContain("Banner");
  });

  test("keeps chrome free of session diagnostics during initial and background checks", async () => {
    const [resolving, setResolving] = createSignal(true);
    const container = render(() => <ApplicationChrome sessionResolving={resolving()} signedIn={!resolving()} sessionPending>Route</ApplicationChrome>);
    expect(container.textContent).not.toMatch(/Checking (your )?account|Your Pirate|Session active/);
    setResolving(false);
    await vi.waitFor(() => expect(container.querySelector("[data-shell-auth]")?.getAttribute("data-shell-auth")).toBe("authenticated"));
    expect(container.textContent).not.toMatch(/Checking (your )?account|Your Pirate|Session active/);
  });

  test("connects desktop destinations and keeps native link targets", () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome signedIn communityNavigation={{ kind: "ready", data: { joined: [], popular: [], created: [] } }} navigate={navigate}>Route</ApplicationChrome>);
    for (const path of ["/", "/songs", "/wallet"]) {
      const link = container.querySelector<HTMLAnchorElement>(`aside a[href="${path}"]`)!;
      expect(link).not.toBeNull();
      link.click();
      expect(navigate).toHaveBeenLastCalledWith(path);
    }
    for (const path of ["/search", "/live", "/study", "/karaoke", "/settings", "/activity"]) expect(container.querySelector(`a[href="${path}"]`)).toBeNull();
    container.querySelector<HTMLButtonElement>('aside button[aria-label="Create community"]')!.click();
    expect(navigate).toHaveBeenLastCalledWith("/communities/new");
    expect([...container.querySelectorAll<HTMLButtonElement>("aside button")].some(button => button.textContent === "Create")).toBe(false);
    expect(container.textContent).not.toContain("Notifications");
  });

  test("mobile has four destinations and Wallet opens the wallet route", () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome navigate={navigate} mobileActiveItem="wallet" mode="immersive">Route</ApplicationChrome>);
    const footer = container.querySelector('nav[aria-label="Primary navigation"]')!;
    expect(footer.querySelectorAll("button")).toHaveLength(4);
    // An unsigned profile tab reads Sign in, matching what a tap there does.
    const labels = [...footer.querySelectorAll("button")].map(control => control.getAttribute("aria-label"));
    expect(labels).toEqual(["For You", "Your Songs", "Wallet", "Sign in"]);
    footer.querySelector<HTMLButtonElement>('button[aria-label="Wallet"]')!.click();
    expect(navigate).toHaveBeenCalledWith("/wallet");
    expect(footer.querySelector('[aria-current="page"]')?.textContent).toBe("Wallet");
    footer.querySelector<HTMLButtonElement>('button[aria-label="Your Songs"]')!.click();
    expect(navigate).toHaveBeenLastCalledWith("/songs");
    const post = container.querySelector<HTMLButtonElement>('button[aria-label="Choose a community to post in"]');
    expect(post?.textContent).toBe("Post");
    post!.click();
    expect(navigate).toHaveBeenLastCalledWith("/communities");
  });

  test("the phone drawer lists communities once and leaves profile switching to the footer", async () => {
    const navigate = vi.fn();
    const personas = [{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift", communityId: "community-2" }];
    const communities = [
      { communityId: "community-1", displayName: "Harbor Collective", href: "/c/harbor" },
      { communityId: "community-2", displayName: "Night Radio", href: "/c/night" },
    ];
    const container = render(() => <ApplicationChrome signedIn navigate={navigate} personas={personas} selectedPersonaId="one" loadCommunities={async () => communities}>Route</ApplicationChrome>);
    container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = document.querySelector('[role="dialog"]')!;
    await vi.waitFor(() => expect(dialog.textContent).toContain("Night Radio"));
    expect(dialog.textContent).not.toContain("Night Shift");
    expect([...dialog.querySelectorAll("button")].some(button => button.textContent?.trim() === "Harbor")).toBe(false);
    expect(dialog.querySelector('a[href="/wallet"], a[href="/songs"]')).toBeNull();
    dialog.querySelector<HTMLAnchorElement>('a[href="/c/harbor"]')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/c/harbor"));
    expect(document.body.style.pointerEvents).not.toBe("none");
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });

  test("a single tap on the profile tab opens the selected profile's page", async () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome signedIn navigate={navigate} personas={[{ personaId: "one", displayName: "Harbor", publicHandle: "harbor.pirate" }, { personaId: "two", displayName: "Night Shift" }]} selectedPersonaId="one">Route</ApplicationChrome>);
    container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/u/harbor.pirate"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("a double tap with two account profiles toggles between them without a sheet", async () => {
    const onPersonaSelect = vi.fn();
    const container = render(() => <ApplicationChrome signedIn onPersonaSelect={onPersonaSelect} personas={[{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }]} selectedPersonaId="one">Route</ApplicationChrome>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!;
    profileTab.click();
    profileTab.click();
    expect(onPersonaSelect).toHaveBeenCalledWith("two");
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("a double tap with three or more account profiles opens the profile sheet", async () => {
    const container = render(() => <ApplicationChrome signedIn personas={[{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }, { personaId: "three", displayName: "Studio" }]} selectedPersonaId="one">Route</ApplicationChrome>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!;
    profileTab.click();
    profileTab.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label") ?? document.querySelector('[role="dialog"]')?.textContent).toContain("Your profiles"));
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Settings");
  });

  test("profile opens the picker and changes the avatar identity without navigating", async () => {
    const navigate = vi.fn();
    const personas = [{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }];
    const [selected, setSelected] = createSignal("one");
    const container = render(() => <ApplicationChrome signedIn personas={personas} selectedPersonaId={selected()} onPersonaSelect={setSelected} navigate={navigate}>Route</ApplicationChrome>);
    container.querySelector<HTMLButtonElement>('aside button[aria-label="Switch profile, currently Harbor"]')!.click();
    await vi.waitFor(() => expect(document.querySelectorAll('input[type="radio"]').length).toBe(2));
    document.querySelectorAll<HTMLElement>('input[type="radio"]')[1]!.click();
    await vi.waitFor(() => expect(selected()).toBe("two"));
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector('aside button[aria-label="Switch profile, currently Night Shift"]')).not.toBeNull();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  });

  test("account failures recover inside the profile dialog", async () => {
    const retry = vi.fn();
    const container = render(() => <ApplicationChrome sessionUnavailable onSessionRetry={retry}>Route</ApplicationChrome>);
    expect(container.textContent).not.toContain("could not");
    container.querySelector<HTMLButtonElement>('aside button[aria-label="Profile"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === "Try again")!.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  test("anonymous profile and sign-in controls open the owned sign-in host", () => {
    const requested = vi.fn();
    window.addEventListener("pirate:connect", requested, { once: true });
    const container = render(() => <ApplicationChrome>Route</ApplicationChrome>);
    container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Sign in"]')!.click();
    expect(requested).toHaveBeenCalledOnce();
  });

  function communityTarget(personaCount: number, capture: (store: ReturnType<typeof useActivePersonaStore>) => void) {
    // Registers from an effect, exactly as the community page does.
    return function RegisterCommunityTarget() {
      const store = useActivePersonaStore();
      capture(store);
      createEffect(() => true, () => store.setTarget({
        communityId: "community-1",
        personas: [{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }, { personaId: "three", displayName: "Studio" }].slice(0, personaCount),
        title: "Profile in this community",
      }));
      return null;
    };
  }

  test("on a community page a double tap with two eligible profiles toggles the community profile", async () => {
    let store: ReturnType<typeof useActivePersonaStore> | undefined;
    const Register = communityTarget(2, captured => { store = captured; });
    const onPersonaSelect = vi.fn();
    const container = render(() => <ActivePersonaProvider><Register /><ApplicationChrome signedIn onPersonaSelect={onPersonaSelect} personas={[{ personaId: "one", displayName: "Harbor" }]} selectedPersonaId="one">Route</ApplicationChrome></ActivePersonaProvider>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!;
    profileTab.click();
    profileTab.click();
    await vi.waitFor(() => expect(store!.activePersonaId("community-1")).toBe("two"));
    await new Promise(resolve => setTimeout(resolve, 350));
    profileTab.click();
    profileTab.click();
    await vi.waitFor(() => expect(store!.activePersonaId("community-1")).toBe("one"));
    expect(onPersonaSelect).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("on a community page a double tap with three eligible profiles opens that community's sheet", async () => {
    const Register = communityTarget(3, () => {});
    const container = render(() => <ActivePersonaProvider><Register /><ApplicationChrome signedIn personas={[{ personaId: "one", displayName: "Harbor" }]} selectedPersonaId="one">Route</ApplicationChrome></ActivePersonaProvider>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!;
    profileTab.click();
    profileTab.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Profile in this community"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  test("on a community page with one eligible profile a double tap never switches account profiles", async () => {
    const Register = communityTarget(1, () => {});
    const navigate = vi.fn();
    const onPersonaSelect = vi.fn();
    const container = render(() => <ActivePersonaProvider><Register /><ApplicationChrome signedIn navigate={navigate} onPersonaSelect={onPersonaSelect} personas={[{ personaId: "one", displayName: "Harbor", publicHandle: "harbor.pirate" }, { personaId: "two", displayName: "Night Shift" }]} selectedPersonaId="one">Route</ApplicationChrome></ActivePersonaProvider>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Profile, Harbor"]')!;
    // Without a double-tap action the single tap is immediate.
    profileTab.click();
    expect(navigate).toHaveBeenCalledWith("/u/harbor.pirate");
    profileTab.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(onPersonaSelect).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test("bare routes omit chrome", () => {
    const container = render(() => <ApplicationChrome mode="bare"><main>Verify</main></ApplicationChrome>);
    expect(container.querySelector("[data-application-chrome]")).toBeNull();
  });
});

describe("community application navigation", () => {
  test("suppresses global discovery reads and anonymous moderation", async () => {
    const loadCommunityNavigation = vi.fn();
    const container = render(() => <ApplicationChrome signedIn={false} navigationScope={{ kind: "community", community: { communityId: "harbor", displayName: "Harbor", href: "/c/harbor" }, moderationHref: "/c/harbor/settings/moderation_queue" }} loadCommunityNavigation={loadCommunityNavigation}>Feed</ApplicationChrome>);
    await Promise.resolve();
    expect(loadCommunityNavigation).not.toHaveBeenCalled();
    const navigation = container.querySelector('nav[aria-label="Main navigation"]')!;
    expect(navigation.querySelector('a[href="/explore"]')).toBeNull();
    expect(navigation.querySelector('a[href="/c/harbor/settings/moderation_queue"]')).toBeNull();
    expect(navigation.querySelector('a[href="/c/harbor"]')?.textContent).toContain("Home");
  });
});

test("anonymous production defaults hide community discovery without an error or retry", async () => {
  const memberships = vi.fn();
  const container = render(() => <ApplicationChrome signedIn={false} loadCommunities={memberships}>Feed</ApplicationChrome>);
  await vi.waitFor(() => expect(container.querySelector('[aria-label="Create community"]')).toBeNull());
  expect(memberships).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("Communities couldn’t be loaded");
  expect(container.querySelector('[aria-label="Create community"]')).toBeNull();
});

test("route navigation updates the current community without reloading memberships", async () => {
  const load = vi.fn(async () => [{ communityId: "harbor", displayName: "Harbor", href: "/c/harbor" }]);
  const [path, setPath] = createSignal("/");
  const container = render(() => <ApplicationChrome signedIn currentPath={path()} loadCommunities={load}>Feed</ApplicationChrome>);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  setPath("/c/harbor");
  await vi.waitFor(() => expect(container.querySelector('a[href="/c/harbor"]')?.getAttribute("aria-current")).toBe("page"));
  expect(load).toHaveBeenCalledTimes(1);
});

test("an authenticated account without profiles can reach Settings through the profile picker", async () => {
  const navigate = vi.fn();
  const container = render(() => <ApplicationChrome signedIn personas={[]} navigate={navigate}>Feed</ApplicationChrome>);
  container.querySelector<HTMLAnchorElement>('aside a[href="/me"]')!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] a[href="/settings"]')).not.toBeNull());
  document.querySelector<HTMLAnchorElement>('[role="dialog"] a[href="/settings"]')!.click();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings"));
});
