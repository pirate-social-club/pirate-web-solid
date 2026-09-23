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
    const container = render(() => <ApplicationChrome navigate={navigate}>Route</ApplicationChrome>);
    for (const path of ["/", "/songs", "/wallet", "/communities", "/settings"]) {
      const link = container.querySelector<HTMLAnchorElement>(`aside a[href="${path}"]`)!;
      expect(link).not.toBeNull();
      link.click();
      expect(navigate).toHaveBeenLastCalledWith(path);
    }
    for (const path of ["/search", "/live", "/study", "/karaoke", "/terms", "/privacy", "/activity"]) expect(container.querySelector(`a[href="${path}"]`)).toBeNull();
    [...container.querySelectorAll<HTMLButtonElement>("aside button")].find(button => button.textContent === "Create community")!.click();
    expect(navigate).toHaveBeenLastCalledWith("/communities/new");
    expect(container.textContent).not.toContain("Notifications");
  });

  test("mobile has four tabs and Wallet opens the wallet route", () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome navigate={navigate} mobileActiveItem="wallet">Route</ApplicationChrome>);
    const footer = container.querySelector('nav[aria-label="Primary navigation"]')!;
    expect(footer.querySelectorAll("button")).toHaveLength(4);
    footer.querySelector<HTMLButtonElement>('button[aria-label="Wallet"]')!.click();
    expect(navigate).toHaveBeenCalledWith("/wallet");
    expect(footer.querySelector('[aria-current="page"]')?.textContent).toBe("Wallet");
    footer.querySelector<HTMLButtonElement>('button[aria-label="Your songs"]')!.click();
    expect(navigate).toHaveBeenLastCalledWith("/songs");
  });

  test("hamburger opens shared navigation and choosing a route closes it", async () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome navigate={navigate}>Route</ApplicationChrome>);
    container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = document.querySelector('[role="dialog"]')!;
    dialog.querySelector<HTMLAnchorElement>('a[href="/communities"]')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/communities"));
    expect(document.body.style.pointerEvents).not.toBe("none");
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
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

  test("a double tap on the profile tab opens the community switcher, not the account picker", async () => {
    const accountPersonas = [{ personaId: "one", displayName: "Harbor" }];
    // Registers from an effect, exactly as the community page does.
    function RegisterCommunityTarget() {
      const store = useActivePersonaStore();
      createEffect(() => true, () => store.setTarget({
        communityId: "community-1",
        personas: [{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }],
        title: "Profile in this community",
      }));
      return null;
    }
    const container = render(() => <ActivePersonaProvider><RegisterCommunityTarget /><ApplicationChrome signedIn personas={accountPersonas} selectedPersonaId="one">Route</ApplicationChrome></ActivePersonaProvider>);
    const profileTab = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Switch profile, currently Harbor"]')!;
    profileTab.click();
    profileTab.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Profile in this community"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  test("a single tap on the profile tab still opens the account picker when a community target exists", async () => {
    // Registers from an effect, exactly as the community page does.
    function RegisterCommunityTarget() {
      const store = useActivePersonaStore();
      createEffect(() => true, () => store.setTarget({
        communityId: "community-1",
        personas: [{ personaId: "one", displayName: "Harbor" }, { personaId: "two", displayName: "Night Shift" }],
        title: "Profile in this community",
      }));
      return null;
    }
    const container = render(() => <ActivePersonaProvider><RegisterCommunityTarget /><ApplicationChrome signedIn personas={[{ personaId: "one", displayName: "Harbor" }]} selectedPersonaId="one">Route</ApplicationChrome></ActivePersonaProvider>);
    container.querySelector<HTMLButtonElement>('nav[aria-label="Primary navigation"] button[aria-label="Switch profile, currently Harbor"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Profile in this community");
  });

  test("bare routes omit chrome", () => {
    const container = render(() => <ApplicationChrome mode="bare"><main>Verify</main></ApplicationChrome>);
    expect(container.querySelector("[data-application-chrome]")).toBeNull();
  });
});
