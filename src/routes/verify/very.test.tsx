import { afterEach, describe, expect, it } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";
import VeryVerificationRoute from "./very.tsx";

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
  document.head.replaceChildren();
});

describe("Very verification route", () => {
  it("renders a guarded start screen for an opaque community join intent", () => {
    const container = render(() => <VeryVerificationRoute />);
    expect(container.querySelector("[data-route-path='/verify/very']")).not.toBeNull();
    expect(container.textContent).toContain("Very palm verification");
    expect(container.textContent).toContain("Community join intent ID");
    expect(container.textContent).toContain("Start palm verification");
  });
});
