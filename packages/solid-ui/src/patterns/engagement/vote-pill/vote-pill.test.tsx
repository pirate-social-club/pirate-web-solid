import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { VotePill } from "./vote-pill";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("VotePill", () => {
  it("renders the formatted score with up and down buttons", () => {
    const container = render(() => <VotePill score={18} />);

    expect(within(container).getByText("18")).toBeVisible();
    expect(within(container).getByRole("button", { name: "Upvote" })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Downvote" })).toBeVisible();
  });

  it("formats thousands with a k suffix", () => {
    const container = render(() => <VotePill score={1240} />);

    expect(within(container).getByText("1.2k")).toBeVisible();
  });

  it("exposes the viewer vote through aria-pressed", () => {
    const container = render(() => <VotePill score={321} viewerVote="up" />);

    expect(within(container).getByRole("button", { name: "Upvote", pressed: true })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Downvote", pressed: false })).toBeVisible();
  });

  it("reports votes and clears a repeat vote when allowClear is set", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    const container = render(() => <VotePill allowClear onVote={onVote} score={18} viewerVote="up" />);

    await user.click(within(container).getByRole("button", { name: "Upvote" }));
    flush();
    expect(onVote).toHaveBeenLastCalledWith(null);

    await user.click(within(container).getByRole("button", { name: "Downvote" }));
    flush();
    expect(onVote).toHaveBeenLastCalledWith("down");
  });

  it("does not re-fire the active vote without allowClear", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    const container = render(() => <VotePill onVote={onVote} score={18} viewerVote="up" />);

    const upvote = within(container).getByRole("button", { name: "Upvote" });
    expect(upvote).toBeDisabled();

    await user.click(upvote);
    flush();
    expect(onVote).not.toHaveBeenCalled();
  });

  it("shows a pending spinner while an async vote resolves", async () => {
    const user = userEvent.setup();
    let resolveVote: (() => void) | undefined;
    const onVote = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveVote = resolve;
      }),
    );
    const container = render(() => <VotePill onVote={onVote} score={18} />);

    await user.click(within(container).getByRole("button", { name: "Upvote" }));
    flush();
    expect(within(container).queryByRole("status")).not.toBeInTheDocument();

    resolveVote?.();
    await Promise.resolve();
    flush();
    expect(onVote).toHaveBeenCalledWith("up");
  });

  it("disables both buttons while busy", () => {
    const container = render(() => <VotePill busy score={18} />);

    expect(within(container).getByRole("button", { name: "Upvote" })).toBeDisabled();
    expect(within(container).getByRole("button", { name: "Downvote" })).toBeDisabled();
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });

  it("uses custom labels when provided", () => {
    const container = render(() => <VotePill downvoteLabel="Dislike" score={18} upvoteLabel="Like" />);

    expect(within(container).getByRole("button", { name: "Like" })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Dislike" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <VotePill score={18} />
        <VotePill score={321} viewerVote="up" />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
