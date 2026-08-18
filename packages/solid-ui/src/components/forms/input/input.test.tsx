import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Input } from "./input";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Input", () => {
  it("renders a styled native input", () => {
    const container = render(() => <Input aria-label="Name" />);

    const input = within(container).getByRole("textbox", { name: "Name" });
    expect(input.tagName).toBe("INPUT");
  });

  it("accepts typing and updates its value", async () => {
    const user = userEvent.setup();
    const container = render(() => <Input aria-label="Name" />);

    const input = within(container).getByRole("textbox", {
      name: "Name",
    }) as HTMLInputElement;

    await user.type(input, "hello solid");
    expect(input).toHaveValue("hello solid");
  });

  it("forwards placeholder, type, and autocomplete", () => {
    const container = render(() => (
      <Input aria-label="Email" placeholder="you@example.com" type="email" autocomplete="email" />
    ));

    const input = within(container).getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("placeholder", "you@example.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("supports the disabled state", () => {
    render(() => <Input aria-label="Name" disabled />);

    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("applies the flat variant without a border", () => {
    const container = render(() => <Input aria-label="Name" variant="flat" />);

    expect(within(container).getByRole("textbox")).toHaveClass("border-0");
  });

  it("has no axe violations", async () => {
    render(() => <Input aria-label="Name" placeholder="Type something…" />);

    await expectNoA11yViolations();
  });
});
