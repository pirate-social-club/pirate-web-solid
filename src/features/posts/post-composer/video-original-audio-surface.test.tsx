/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";

import {
  OriginalVideoCaptureSurface,
  OriginalVideoPublicationSurface,
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

  test("keeps review to one optional caption and read-only server settings", () => {
    render(() => <OriginalVideoReviewSurface caption="One caption" />);

    expect(document.querySelector("textarea")?.value).toBe("One caption");
    expect(document.querySelector("input[aria-label='Title']")).toBeNull();
    expect(document.body.textContent).toContain("Generated after upload");
    expect(document.body.textContent).toContain("Recorded soundtrack");
    expect(document.body.textContent).not.toContain("Commercial remix");
    expect(document.body.textContent).not.toContain("Paid unlock");
  });

  test("keeps held work private and gives retryable failure an action", () => {
    render(() => <OriginalVideoPublicationSurface state="rights_review" />);
    expect(document.body.textContent).toContain("No post is public yet");

    disposers.pop()?.();
    render(() => <OriginalVideoPublicationSurface state="failed" />);
    expect([...document.querySelectorAll("button")].some((button) =>
      button.textContent?.trim() === "Retry"
    )).toBe(true);
  });
});
