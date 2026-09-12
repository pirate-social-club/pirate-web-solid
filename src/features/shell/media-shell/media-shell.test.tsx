import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

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

describe("Media shell production navigation", () => {
  test("dispatches the global sign-in request from anonymous application chrome", () => {
    const signInRequested = vi.fn();
    window.addEventListener("pirate:connect", signInRequested, { once: true });
    const container = render(() => <ApplicationChrome><main>Current route</main></ApplicationChrome>);

    const signIn = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.trim() === "Sign in");
    signIn?.click();

    expect(signIn).toBeDefined();
    expect(signInRequested).toHaveBeenCalledOnce();
  });

  test("renders a neutral initial account check without sign-in messaging", () => {
    const container = render(() => <ApplicationChrome sessionResolving><main>Current route</main></ApplicationChrome>);
    expect(container.querySelector("[data-shell-auth]")?.getAttribute("data-shell-auth")).toBe("resolving");
    expect(container.textContent).toContain("Checking your account");
    expect(container.textContent).not.toContain("Join Pirate");
    expect(container.textContent).not.toContain("Your Pirate");
    const checking = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Checking account")!;
    expect(checking.disabled).toBe(true);
    expect(container.textContent).not.toContain("Sign in");
    expect(container.textContent).not.toContain("Save, follow, and post");
  });

  test("offers account-check recovery instead of sign-in when the session check fails", () => {
    const retry = vi.fn();
    const container = render(() => <ApplicationChrome sessionUnavailable onSessionRetry={retry}><main>Current route</main></ApplicationChrome>);
    expect(container.querySelector("[data-shell-auth]")?.getAttribute("data-shell-auth")).toBe("unavailable");
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.some(button => button.textContent?.trim() === "Sign in")).toBe(false);
    buttons.find(button => button.textContent?.trim() === "Retry account check")!.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  test("disables account retry and shows pending feedback without claiming sign-out", () => {
    const retry = vi.fn();
    const container = render(() => <ApplicationChrome sessionUnavailable sessionPending onSessionRetry={retry}>Route</ApplicationChrome>);
    const checking = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.textContent === "Checking account");
    expect(checking.length).toBeGreaterThan(0);
    for (const button of checking) { expect(button.disabled).toBe(true); button.click(); }
    expect(retry).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Checking your account");
    expect(container.textContent).not.toContain("Sign in");
  });

  test("leaves authenticated footer content and profile access stable during background reads", async () => {
    const [pending, setPending] = createSignal(false);
    const container = render(() => <ApplicationChrome signedIn profileHref="/u/story.pirate" sessionPending={pending()}>Route</ApplicationChrome>);
    const sidebar = container.querySelector("aside")!;
    const before = sidebar.textContent;
    const profile = sidebar.querySelector<HTMLAnchorElement>('a[href="/u/story.pirate"]')!;
    setPending(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sidebar.textContent).toBe(before);
    expect(profile.hidden).toBe(false);
    expect(profile.getAttribute("aria-disabled")).not.toBe("true");
    expect(sidebar.textContent).toContain("View your public profile");
    expect(sidebar.textContent).not.toContain("Checking your account");
  });

  test("does not disable the anonymous sign-in action merely because pending is set", () => {
    const container = render(() => <ApplicationChrome sessionPending>Route</ApplicationChrome>);
    const signIn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Sign in")!;
    expect(signIn.disabled).toBe(false);
    expect(container.textContent).toContain("Save, follow, and post");
    expect(container.textContent).not.toContain("Checking your account");
  });

  test("offers community creation without advertising global post or placeholder Study actions", () => {
    const container = render(() => <ApplicationChrome><main>Current route</main></ApplicationChrome>);
    const navigationLabels = Array.from(container.querySelectorAll("nav button"))
      .map((button) => button.textContent?.trim());

    expect(navigationLabels).toContain("Create community");
    expect(navigationLabels).toContain("Communities");
    expect(navigationLabels).not.toContain("Study");
    expect(navigationLabels).not.toContain("Karaoke");
    expect(navigationLabels).not.toContain("Search");
    expect(navigationLabels).not.toContain("Live");
    expect(navigationLabels).not.toContain("Activity");
    expect(container.querySelector("header button[aria-label='Go home']")).not.toBeNull();
    expect(container.textContent).not.toContain("Create post");
  });

  test("routes membership discovery and creation through distinct shell actions", () => {
    const navigate = vi.fn();
    const container = render(() => <ApplicationChrome navigate={navigate}><main>Current route</main></ApplicationChrome>);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("nav button")];
    buttons.find(button => button.textContent?.trim() === "Communities")?.click();
    buttons.find(button => button.textContent?.trim() === "Create community")?.click();
    expect(navigate).toHaveBeenNthCalledWith(1, "/communities");
    expect(navigate).toHaveBeenNthCalledWith(2, "/communities/new");
  });

  test("keeps immersive controls and mobile selection inside the same chrome owner", () => {
    const navigate = vi.fn();
    const container = render(() => (
      <ApplicationChrome mobileActiveItem="communities" mode="immersive" navigate={navigate}>
        <main>Video route</main>
      </ApplicationChrome>
    ));

    container.querySelector<HTMLButtonElement>("header button[aria-label='Create community']")?.click();
    expect(navigate).toHaveBeenCalledWith("/communities/new");
    expect(container.querySelector("nav[aria-label='Primary navigation'] button[aria-current='page']")?.textContent).toContain("Communities");
  });

  test("renders ceremony routes without application chrome", () => {
    const container = render(() => <ApplicationChrome mode="bare"><main data-ceremony>Verify</main></ApplicationChrome>);
    expect(container.querySelector("[data-application-chrome]")).toBeNull();
    expect(container.querySelector("[data-ceremony]")).not.toBeNull();
  });
});
