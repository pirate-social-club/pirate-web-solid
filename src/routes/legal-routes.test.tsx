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

describe("public legal placeholder routes", () => {
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
    ["/terms", "Terms", TermsRoute],
    ["/privacy", "Privacy Policy", PrivacyRoute],
  ] as const)("renders %s as an explicit placeholder", (path, title, Route) => {
    const container = renderRoute(() => <Route />);

    expect(container.querySelector("main")?.dataset.routePath).toBe(path);
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.textContent).toContain("Approved legal copy has not been published yet.");
    expect(container.querySelector("a[href='/auth/sign-in']")?.textContent).toContain("Back to sign in");
  });
});
