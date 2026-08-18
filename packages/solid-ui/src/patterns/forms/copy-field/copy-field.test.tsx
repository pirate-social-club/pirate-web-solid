import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { CopyField } from "./copy-field";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("CopyField", () => {
  it("renders the value and a copy button", () => {
    const container = render(() => (
      <CopyField value="0x1234567890abcdef" copyLabel="address" />
    ));

    const view = within(container);
    expect(view.getByText("0x1234567890abcdef")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });

  it("copies the value to the clipboard and confirms", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const container = render(() => (
      <CopyField value="0x1234567890abcdef" copyLabel="address" />
    ));

    await user.click(within(container).getByRole("button", { name: "Copy address" }));

    expect(writeText).toHaveBeenCalledWith("0x1234567890abcdef");
    expect(
      within(container).getByRole("button", { name: "address copied" }),
    ).toBeInTheDocument();
  });

  it("supports a wrapped value", () => {
    const container = render(() => (
      <CopyField
        value="a-very-long-value-that-would-otherwise-truncate-to-a-single-line"
        wrap
      />
    ));

    expect(
      within(container).getByText(
        "a-very-long-value-that-would-otherwise-truncate-to-a-single-line",
      ),
    ).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => <CopyField value="0x1234567890abcdef" copyLabel="address" />);

    await expectNoA11yViolations();
  });
});
