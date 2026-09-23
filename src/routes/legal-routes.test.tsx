import { resolve } from "node:path";
import { render as solidRender } from "@solidjs/web";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import PrivacyRoute from "./privacy.tsx";
import TermsRoute from "./terms.tsx";

const disposers: Array<() => void> = [];

function renderRoute(route: () => ReturnType<typeof TermsRoute>): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(route, container);
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("public legal routes", () => {
  test("registers both sign-in destinations as filesystem routes", async () => {
    const router = new PageFileSystemRouter({
      dir: resolve("src/routes"),
      extensions: ["js", "jsx", "ts", "tsx"],
    });
    const paths = buildRouteTree(await router.getRoutes()).map(route => route.path);

    expect(paths).toContain("/terms");
    expect(paths).toContain("/privacy");
  });

  test.each([
    ["/terms", "Terms of Service", TermsRoute, "What you post"],
    ["/privacy", "Privacy Policy", PrivacyRoute, "Microphone recordings"],
  ] as const)("renders %s with its sections and a way home", (path, title, Route, section) => {
    const container = renderRoute(() => <Route />);

    expect(container.querySelector("main")?.dataset.routePath).toBe(path);
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect([...container.querySelectorAll("h2")].map(heading => heading.textContent)).toContain(section);
    expect(container.textContent).not.toContain("placeholder");
    expect(container.querySelector("a[href='/']")?.textContent).toContain("Go home");
  });
});
