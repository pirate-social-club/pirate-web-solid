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
  test("does not advertise the placeholder Study discovery route", () => {
    const container = render(() => <MediaShell><main>Current route</main></MediaShell>);
    const navigationLabels = Array.from(container.querySelectorAll("nav button"))
      .map((button) => button.textContent?.trim());

    expect(navigationLabels).not.toContain("Study");
    expect(navigationLabels).toContain("Karaoke");
  });
});
