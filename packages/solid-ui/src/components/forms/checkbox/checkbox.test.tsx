import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import {
  Checkbox,
  CheckboxDescription,
  CheckboxErrorMessage,
  CheckboxLabel,
} from "./checkbox";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Checkbox", () => {
  it("renders a named checkbox input", () => {
    const container = render(() => <Checkbox aria-label="Accept terms" />);

    expect(
      within(container).getByRole("checkbox", { name: "Accept terms" }),
    ).toBeInTheDocument();
  });

  it("toggles on control click and reports boolean state", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const onChange = vi.fn((next: boolean) => setChecked(next));
    const container = render(() => (
      <Checkbox aria-label="Accept terms" checked={checked()} onChange={onChange} />
    ));
    flush();

    const input = within(container).getByRole("checkbox", {
      name: "Accept terms",
    });

    await user.click(input);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.click(input);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("toggles with Space while the input is focused", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const container = render(() => (
      <Checkbox
        aria-label="Accept terms"
        checked={checked()}
        onChange={(next) => setChecked(next)}
      />
    ));
    flush();

    const input = within(container).getByRole("checkbox", {
      name: "Accept terms",
    });
    input.focus();
    await user.keyboard(" ");

    expect(screen.getByRole("checkbox", { name: "Accept terms" })).toBeChecked();
  });

  it("exposes the checked state on the visible box", () => {
    const container = render(() => (
      <Checkbox aria-label="Accept terms" checked />
    ));
    flush();

    const input = within(container).getByRole("checkbox", {
      name: "Accept terms",
    });
    expect(input).toBeChecked();
    expect(input.closest("div")?.querySelector("[data-checked]")).not.toBeNull();
  });

  it("supports the indeterminate state as a dash indicator", () => {
    const container = render(() => (
      <Checkbox aria-label="Select all" checked indeterminate />
    ));
    flush();

    expect(container.querySelector("[data-indeterminate]")).not.toBeNull();
  });

  it("associates a label, description, and error message", () => {
    const container = render(() => (
      <Checkbox validationState="invalid">
        <CheckboxLabel>Accept terms</CheckboxLabel>
        <CheckboxDescription>You must accept to continue.</CheckboxDescription>
        <CheckboxErrorMessage>This field is required.</CheckboxErrorMessage>
      </Checkbox>
    ));
    flush();

    const view = within(container);
    const input = view.getByRole("checkbox", { name: "Accept terms" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      view.getByText("You must accept to continue."),
    ).toBeInTheDocument();
  });

  it("supports the disabled state", () => {
    const container = render(() => (
      <Checkbox aria-label="Accept terms" disabled />
    ));

    expect(
      within(container).getByRole("checkbox", { name: "Accept terms" }),
    ).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <Checkbox aria-label="Accept terms">
        <CheckboxLabel>Accept terms</CheckboxLabel>
      </Checkbox>
    ));

    await expectNoA11yViolations();
  });
});
