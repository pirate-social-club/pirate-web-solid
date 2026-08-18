import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./chip";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Chip", () => {
  it("renders as a native button with the default type", () => {
    const container = render(() => <Chip>Genre</Chip>);

    const chip = within(container).getByRole("button", { name: "Genre" });
    expect(chip).toHaveAttribute("type", "button");
  });

  it("spreads interaction props and fires clicks", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const container = render(() => <Chip onClick={onClick}>Genre</Chip>);

    await user.click(within(container).getByRole("button", { name: "Genre" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("exposes toggle state through aria-pressed when provided", () => {
    const container = render(() => <Chip variant="selected" aria-pressed="true">Solo</Chip>);

    expect(within(container).getByRole("button", { name: "Solo", pressed: true })).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <Chip>Default</Chip>
        <Chip variant="selected">Selected</Chip>
        <Chip variant="outline">Outline</Chip>
        <Chip disabled>Disabled</Chip>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
