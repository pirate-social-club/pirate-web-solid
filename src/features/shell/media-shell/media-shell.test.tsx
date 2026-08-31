import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import { MediaShell } from "./media-shell";

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
  test("offers community creation without advertising global post or placeholder Study actions", () => {
    const container = render(() => <MediaShell><main>Current route</main></MediaShell>);
    const navigationLabels = Array.from(container.querySelectorAll("nav button"))
      .map((button) => button.textContent?.trim());

    expect(navigationLabels).toContain("Create community");
    expect(navigationLabels).not.toContain("Study");
    expect(navigationLabels).toContain("Karaoke");
    expect(container.querySelector("header button[aria-label='Create community']")).not.toBeNull();
    expect(container.textContent).not.toContain("Create post");
  });
});
