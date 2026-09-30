/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

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
  const control = (label: string) =>
    [...document.querySelectorAll("button")].find(candidate => candidate.textContent?.trim() === label);

  test("upload uses page navigation and file choice without recording controls", () => {
    const onBack = vi.fn(); const onUpload = vi.fn();
    render(() => <OriginalVideoCaptureSurface channel="upload" songLabel="A song" onBack={onBack} onUpload={onUpload} />);
    expect(document.querySelector('button[aria-label="Start recording"]')).toBeNull();
    expect(document.querySelector('[data-action-footer-shell]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('button[aria-label="Back to song"]')!.click();
    control("Choose a video")!.click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onUpload).toHaveBeenCalledOnce();
  });

  test("fails unsupported recording before capture while preserving upload", () => {
    const onUpload = vi.fn();
    render(() => <OriginalVideoCaptureSurface onUpload={onUpload} status="capability_unavailable" />);

    expect(document.body.textContent).toContain("Recording isn’t available here");
    // A person cannot act on codec names, so none are shown.
    expect(document.body.textContent).not.toMatch(/H\.264|AAC|WebM/);
    expect(document.querySelector("button[aria-label='Start recording']")).toBeNull();
    // Trying again cannot change what a browser can do.
    expect(control("Try again")).toBeUndefined();
    control("Upload a video")!.click();
    expect(onUpload).toHaveBeenCalledOnce();
  });

  test("a denied camera offers to try again beside the upload action", () => {
    const onRetake = vi.fn();
    const onUpload = vi.fn();
    render(() => <OriginalVideoCaptureSurface onRetake={onRetake} onUpload={onUpload} status="camera_denied" />);

    expect(document.body.textContent).toContain("Camera unavailable");
    expect(document.body.textContent).toContain("Allow it in your browser settings");
    control("Try again")!.click();
    expect(onRetake).toHaveBeenCalledOnce();
    expect(onUpload).not.toHaveBeenCalled();
    control("Choose a video instead")!.click();
    expect(onUpload).toHaveBeenCalledOnce();
  });

  test("a recording that stopped says so and offers to try again", () => {
    const onRetake = vi.fn();
    const onUpload = vi.fn();
    render(() => <OriginalVideoCaptureSurface onRetake={onRetake} onUpload={onUpload} status="recording_failed" />);

    expect(document.body.textContent).toContain("Recording stopped");
    expect(document.body.textContent).toContain("nothing was saved");
    // It is not a statement about the browser.
    expect(document.body.textContent).not.toContain("isn’t available here");
    control("Try again")!.click();
    expect(onRetake).toHaveBeenCalledOnce();
    control("Upload a video")!.click();
    expect(onUpload).toHaveBeenCalledOnce();
  });

  test("the upload panel states what a video must be without naming codecs", () => {
    render(() => <OriginalVideoCaptureSurface channel="upload" />);

    expect(document.body.textContent).toContain("3 to 15 seconds");
    expect(document.body.textContent).not.toMatch(/H\.264|AAC/);
  });

  test("upload is not offered while a take is recording", () => {
    render(() => <OriginalVideoCaptureSurface status="recording" />);

    expect(control("Upload")!.disabled).toBe(true);
  });

  test("upload is offered before a take starts", () => {
    render(() => <OriginalVideoCaptureSurface status="idle" />);

    expect(control("Upload")!.disabled).toBe(false);
  });

  test("keeps review to the take, its song, no text field and Publish", () => {
    render(() => <OriginalVideoReviewSurface songLabel="A song · 0:00 to 0:15" />);

    expect(document.querySelector("textarea")).toBeNull();
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
