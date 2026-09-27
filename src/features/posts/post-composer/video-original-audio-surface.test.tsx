/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import {
  OriginalVideoCaptureSurface,
  OriginalVideoReviewSurface,
} from "./video-original-audio-surface";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): void {
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
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("original-audio video design surfaces", () => {
  test("fails unsupported recording before capture while preserving upload", () => {
    render(() => <OriginalVideoCaptureSurface status="capability_unavailable" />);

    expect(document.body.textContent).toContain("Recording is not supported here");
    expect(document.body.textContent).toContain("WebM recording is not available");
    expect(document.querySelector("button[aria-label='Start recording']")).toBeNull();
    expect([...document.querySelectorAll("button")].some((button) =>
      button.textContent?.trim() === "Choose a compatible video"
    )).toBe(true);
  });

  test("keeps review to the take, its song, one optional caption and Publish", () => {
    render(() => <OriginalVideoReviewSurface caption="One caption" songLabel="A song · 0:00 to 0:15" />);

    expect(document.querySelector("textarea")?.value).toBe("One caption");
    expect(document.querySelector("input[aria-label='Title']")).toBeNull();
    expect(document.body.textContent).toContain("A song · 0:00 to 0:15");
    expect(document.body.textContent).toContain("Publish video");
    expect(document.body.textContent).not.toContain("Settings");
    expect(document.body.textContent).not.toContain("Poster");
    expect(document.body.textContent).not.toContain("Rights");
    expect(document.body.textContent).not.toContain("Commercial remix");
    expect(document.body.textContent).not.toContain("Paid unlock");
  });
});
