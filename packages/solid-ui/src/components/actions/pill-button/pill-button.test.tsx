import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PillButton } from "./pill-button";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("PillButton", () => {
  it("renders a native button with the default type", () => {
    const container = render(() => <PillButton>Best</PillButton>);

    const pill = within(container).getByRole("button", { name: "Best" });
    expect(pill).toHaveAttribute("type", "button");
  });

  it("fires clicks and respects an explicit type", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const container = render(() => <PillButton type="submit" onClick={onClick}>Send</PillButton>);

    const pill = within(container).getByRole("button", { name: "Send" });
    expect(pill).toHaveAttribute("type", "submit");

    await user.click(pill);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("exposes toggle state through aria-pressed when provided", () => {
    const container = render(() => <PillButton tone="selected" aria-pressed="true">Top</PillButton>);

    expect(within(container).getByRole("button", { name: "Top", pressed: true })).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <PillButton>Best</PillButton>
        <PillButton tone="selected">Top</PillButton>
        <PillButton disabled>Locked</PillButton>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
