import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommentPill } from "./comment-pill";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("CommentPill", () => {
  it("renders the count inside an accessible name", () => {
    const container = render(() => <CommentPill count={24} />);

    const pill = within(container).getByRole("button", { name: "Comments (24)" });
    expect(pill).toBeVisible();
    expect(within(pill).getByText("24")).toBeVisible();
  });

  it("fires onComment on click", async () => {
    const user = userEvent.setup();
    const onComment = vi.fn();
    const container = render(() => <CommentPill count={3} onComment={onComment} />);

    await user.click(within(container).getByRole("button", { name: "Comments (3)" }));
    expect(onComment).toHaveBeenCalledOnce();
  });

  it("renders zero counts", () => {
    const container = render(() => <CommentPill count={0} />);

    expect(within(container).getByRole("button", { name: "Comments (0)" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <CommentPill count={0} />
        <CommentPill count={24} />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
