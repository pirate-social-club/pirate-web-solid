import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RewardPill } from "./reward-pill";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("RewardPill", () => {
  it("names the activity count, not money or an earned reward", () => {
    const container = render(() => <RewardPill activityCount={3} />);

    const pill = within(container).getByRole("button", { name: "Rewards (3 activities)" });
    expect(pill).toBeVisible();
    expect(within(pill).getByText("3")).toBeVisible();
  });

  it("uses the singular for one activity", () => {
    const container = render(() => <RewardPill activityCount={1} />);

    expect(within(container).getByRole("button", { name: "Rewards (1 activity)" })).toBeVisible();
  });

  it("fires onOpen on click", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const container = render(() => <RewardPill activityCount={3} onOpen={onOpen} />);

    await user.click(within(container).getByRole("button", { name: "Rewards (3 activities)" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("has no axe violations", async () => {
    render(() => <RewardPill activityCount={3} />);

    await expectNoA11yViolations();
  });
});
