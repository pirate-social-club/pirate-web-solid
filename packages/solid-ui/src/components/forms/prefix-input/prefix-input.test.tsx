import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { PrefixInput } from "./prefix-input";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("PrefixInput", () => {
  it("renders the prefix adornment and the input", () => {
    const container = render(() => (
      <PrefixInput prefix="$" aria-label="Amount" placeholder="0.00" />
    ));

    const view = within(container);
    expect(view.getByText("$")).toBeInTheDocument();
    expect(view.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("accepts typed text", async () => {
    const user = userEvent.setup();
    const container = render(() => <PrefixInput prefix="$" aria-label="Amount" />);
    const input = within(container).getByRole("textbox", { name: "Amount" });

    await user.type(input, "12.50");
    expect(input).toHaveValue("12.50");
  });

  it("respects the disabled state", () => {
    const container = render(() => (
      <PrefixInput prefix="$" aria-label="Amount" disabled />
    ));

    expect(within(container).getByRole("textbox")).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => <PrefixInput prefix="$" aria-label="Amount" />);

    await expectNoA11yViolations();
  });
});
