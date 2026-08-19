import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import StagingFundingQuoteRoute from "./funding-quote.tsx";

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
  vi.unstubAllGlobals();
  while (disposers.length > 0) disposers.pop()?.();
});

describe("staging funding quote harness route", () => {
  test("renders the quote panel with the configured fixture identifiers", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ enabled: true, communityId: "staging-commerce-raw", listingId: "staging-listing-raw-1" }));
    const container = render(() => <StagingFundingQuoteRoute />);
    await vi.waitFor(() => {
      expect(container.querySelector("[data-funding-quote-state='idle']")).not.toBeNull();
    });
    expect(container.textContent).toContain("Funding quote");
    expect(container.textContent).toContain("no wallet transaction or admission is possible here");
  });

  test("explains when the harness is not enabled", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const container = render(() => <StagingFundingQuoteRoute />);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("not enabled in this environment");
    });
    expect(container.querySelector("[data-funding-quote-state]")).toBeNull();
  });
});
