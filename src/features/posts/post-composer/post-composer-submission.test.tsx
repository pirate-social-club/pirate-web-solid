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

const publishedSnapshot = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post" as const,
  status: "published" as const,
  result: { decision: "allow" as const, reason_code: null },
  published_resource: { kind: "post" as const, post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

const reviewSnapshot = {
  ...publishedSnapshot,
  status: "manual_review" as const,
  result: { decision: "manual_review" as const, reason_code: "review_required" as const },
  published_resource: null,
  review_ref: "review-1",
};

const unavailableReviewSnapshot = {
  ...reviewSnapshot,
  result: { decision: "manual_review" as const, reason_code: "moderation_unavailable" as const },
};

const blockedSnapshot = {
  ...publishedSnapshot,
  status: "blocked" as const,
  result: { decision: "blocked" as const, reason_code: "policy_violation" as const },
  published_resource: null,
};

function submittingState(): PostComposerState {
  return reducePostComposerState(initialPostComposerState, { type: "submit_requested", pending_request_id: "pending-1" });
}

describe("post composer state", () => {
  test("uses required IDs and reconciles ambiguous dispatches", () => {
    const submitting = submittingState();
    expect(submitting).toEqual({ status: "submitting", pending_request_id: "pending-1" });
    expect(reducePostComposerState(submitting, { type: "ambiguous_transport_observed" })).toEqual({
      status: "reconciling",
      pending_request_id: "pending-1",
    });
    expect(reducePostComposerState(
      { status: "reconciling", pending_request_id: "pending-1" },
      { type: "reconciliation_attempt_ambiguous" },
    )).toEqual({ status: "reconciling", pending_request_id: "pending-1" });
  });

  test("projects every closed text publication outcome from an authoritative snapshot", () => {
    const submitting = submittingState();
    expect(reducePostComposerState(submitting, { type: "authoritative_snapshot_received", snapshot: publishedSnapshot })).toEqual({
      status: "published", submission_id: "sub-1", post_href: "/posts/post-1",
    });
    expect(reducePostComposerState(submitting, { type: "authoritative_snapshot_received", snapshot: reviewSnapshot })).toEqual({
      status: "manual_review", submission_id: "sub-1", reason_code: "review_required", review_ref: "review-1",
    });
    expect(reducePostComposerState(submitting, { type: "authoritative_snapshot_received", snapshot: blockedSnapshot })).toEqual({
      status: "blocked", submission_id: "sub-1",
    });
  });

  test("keeps the three transport failure causes closed", () => {
    const causes = ["local_validation_failed", "serialization_failed", "durable_storage_failed"] as const;
    for (const reason of causes) {
      expect(reducePostComposerState(initialPostComposerState, { type: "pre_dispatch_failure", reason })).toEqual({
        status: "transport_failure", reason,
      });
    }
  });

  test("allows retry only with a new required pending request ID after pre-dispatch failure", () => {
    const failure = reducePostComposerState(initialPostComposerState, {
      type: "pre_dispatch_failure", reason: "serialization_failed",
    });
    expect(reducePostComposerState(failure, { type: "retry_requested", pending_request_id: "pending-2" })).toEqual({
      status: "submitting", pending_request_id: "pending-2",
    });
  });

  test("only discards definitively rejected reconciliation states", () => {
    expect(reducePostComposerState({
      status: "reconciling",
      pending_request_id: "pending-1",
      issue: { kind: "server_rejection", status: 400, code: "bad_request" },
    }, { type: "discard_rejected_request" })).toEqual({ status: "editing" });
    expect(reducePostComposerState({
      status: "reconciling",
      pending_request_id: "pending-1",
      issue: { kind: "storage_conflict", record_count: 2 },
    }, { type: "discard_rejected_request" })).toEqual({
      status: "reconciling",
      pending_request_id: "pending-1",
      issue: { kind: "storage_conflict", record_count: 2 },
    });
  });

  test("resolves only a storage conflict into plain reconciliation", () => {
    expect(reducePostComposerState({
      status: "reconciling",
      pending_request_id: "pending-old",
      issue: { kind: "storage_conflict", record_count: 2 },
    }, { type: "resolve_oldest_pending" })).toEqual({
      status: "reconciling",
      pending_request_id: "pending-old",
    });
    expect(reducePostComposerState({
      status: "reconciling",
      pending_request_id: "pending-one",
    }, { type: "resolve_oldest_pending" })).toEqual({
      status: "reconciling",
      pending_request_id: "pending-one",
    });
  });
});

describe("PostComposerSubmission", () => {
  test("does not render publication success for a blocked result", () => {
    const container = render(() => <PostComposerSubmission state={{ status: "blocked", submission_id: "sub-1" }} />);
    expect(container.querySelector("[data-post-composer-state='blocked']")).not.toBeNull();
    expect(container.textContent).toContain("blocked by community policy");
    expect(container.textContent).not.toContain("Post published.");
  });

  test("renders reconciliation without claiming success", () => {
    const onRetry = vi.fn();
    const container = render(() => <PostComposerSubmission onRetry={onRetry} state={{ status: "reconciling", pending_request_id: "pending-1" }} />);
    expect(container.textContent).toContain("Checking whether your post was accepted");
    expect(container.textContent).not.toContain("Post published.");
    container.querySelector("button")?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  test("blocks replay for a conflict and renders moderation unavailability distinctly", () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    const conflict = render(() => <PostComposerSubmission
      onDiscardAndEdit={onDiscard}
      onRetry={onRetry}
      state={{
        status: "reconciling",
        pending_request_id: "pending-1",
        issue: { kind: "idempotency_conflict", submission_id: "sub-existing" },
      }}
    />);
    expect(conflict.textContent).toContain("conflicts with an existing submission");
    expect(conflict.textContent).toContain("Discard and edit");
    conflict.querySelector("button")?.click();
    expect(onDiscard).toHaveBeenCalledOnce();
    conflict.remove();
    const review = render(() => <PostComposerSubmission state={
      { status: "manual_review", submission_id: "sub-1", reason_code: unavailableReviewSnapshot.result.reason_code, review_ref: "review-1" }
    } />);
    expect(review.textContent).toContain("moderation is temporarily unavailable");
  });

  test("offers oldest-record resolution without a discard affordance", () => {
    const onResolveOldest = vi.fn();
    const container = render(() => <PostComposerSubmission
      onDiscardAndEdit={() => {}}
      onResolveOldest={onResolveOldest}
      onRetry={() => {}}
      state={{
        status: "reconciling",
        pending_request_id: "pending-old",
        issue: { kind: "storage_conflict", record_count: 2 },
      }}
    />);
    expect(container.textContent).toContain("Check oldest request");
    expect(container.textContent).not.toContain("Discard and edit");
    container.querySelector("button")?.click();
    expect(onResolveOldest).toHaveBeenCalledOnce();
  });

  test("renders abandoned and each closed pre-dispatch failure cause", () => {
    const abandoned = render(() => <PostComposerSubmission state={{ status: "abandoned", submission_id: "sub-1" }} />);
    expect(abandoned.textContent).toContain("cancelled before publication");
    abandoned.remove();
    for (const reason of ["local_validation_failed", "serialization_failed", "durable_storage_failed"] as const) {
      const container = render(() => <PostComposerSubmission onRetry={() => {}} state={{ status: "transport_failure", reason }} />);
      expect(container.querySelector("[data-post-composer-state='transport_failure']")).not.toBeNull();
      expect(container.textContent).toContain("Try again");
      container.remove();
    }
  });
});
