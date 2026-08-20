import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import { PostComposerSubmission } from "./post-composer-submission";
import {
  initialPostComposerState,
  reducePostComposerState,
  type PostComposerState,
} from "./post-composer-state";

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
});

function submittingState(): PostComposerState {
  return reducePostComposerState(initialPostComposerState, { type: "submit" });
}

describe("post composer state", () => {
  test("models every frozen publication outcome from submitting", () => {
    const submitting = submittingState();

    expect(reducePostComposerState(submitting, { type: "published" })).toEqual({ status: "published" });
    expect(reducePostComposerState(submitting, { type: "manual_review" })).toEqual({ status: "manual_review" });
    expect(reducePostComposerState(submitting, { type: "blocked" })).toEqual({ status: "blocked" });
  });

  test("does not turn a blocked or review result into publication success", () => {
    const submitting = submittingState();

    expect(reducePostComposerState(submitting, { type: "blocked" })).not.toEqual({ status: "published" });
    expect(reducePostComposerState(submitting, { type: "manual_review" })).not.toEqual({ status: "published" });
  });

  test("retries a failure by returning to submitting", () => {
    const failure = reducePostComposerState(submittingState(), { type: "failure", message: "Try again." });
    expect(reducePostComposerState(failure, { type: "retry" })).toEqual({ status: "submitting" });
  });
});

describe("PostComposerSubmission", () => {
  test("does not render publication success for a blocked result", () => {
    const container = render(() => <PostComposerSubmission state={{ status: "blocked" }} />);

    expect(container.querySelector("[data-post-composer-state='blocked']")).not.toBeNull();
    expect(container.textContent).toContain("blocked by community policy");
    expect(container.textContent).not.toContain("Post published.");
  });

  test("offers retry only for a failure", () => {
    const onRetry = vi.fn();
    const container = render(() => <PostComposerSubmission onRetry={onRetry} state={{ status: "failure", message: "The request failed." }} />);
    container.querySelector("button")?.click();

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
