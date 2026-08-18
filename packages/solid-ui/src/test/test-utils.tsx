import { render as solidRender } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import axe from "axe-core";
import { createRoot } from "solid-js";
import { afterEach, expect } from "vitest";

const disposers: Array<() => void> = [];

export function render(ui: () => JSX.Element): HTMLElement {
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
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
});

export async function expectNoA11yViolations() {
  const results = await axe.run(document.body, {
    rules: {
      region: { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
}
