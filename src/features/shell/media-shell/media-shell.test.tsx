import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
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

  test("offers community creation without advertising global post or placeholder Study actions", () => {
    const container = render(() => <ApplicationChrome><main>Current route</main></ApplicationChrome>);
    const navigationLabels = Array.from(container.querySelectorAll("nav button"))
      .map((button) => button.textContent?.trim());

    expect(navigationLabels).toContain("Create community");
    expect(navigationLabels).not.toContain("Study");
    expect(navigationLabels).toContain("Karaoke");
    expect(container.querySelector("header button[aria-label='Go home']")).not.toBeNull();
    expect(container.textContent).not.toContain("Create post");
  });

  test("keeps immersive controls and mobile selection inside the same chrome owner", () => {
    const navigate = vi.fn();
    const container = render(() => (
      <ApplicationChrome mobileActiveItem="learn" mode="immersive" navigate={navigate}>
        <main>Video route</main>
      </ApplicationChrome>
    ));

    container.querySelector<HTMLButtonElement>("header button[aria-label='Create community']")?.click();
    expect(navigate).toHaveBeenCalledWith("/communities/new");
    expect(container.querySelector("nav[aria-label='Primary navigation'] button[aria-current='page']")?.textContent).toContain("Learn");
  });

  test("renders ceremony routes without application chrome", () => {
    const container = render(() => <ApplicationChrome mode="bare"><main data-ceremony>Verify</main></ApplicationChrome>);
    expect(container.querySelector("[data-application-chrome]")).toBeNull();
    expect(container.querySelector("[data-ceremony]")).not.toBeNull();
  });
});
