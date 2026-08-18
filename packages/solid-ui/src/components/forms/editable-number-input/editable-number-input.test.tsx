import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { EditableNumberInput } from "./editable-number-input";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("EditableNumberInput", () => {
  it("commits parsed numbers as they are typed", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const container = render(() => (
      <EditableNumberInput
        aria-label="Duration"
        value={30}
        onValueChange={onValueChange}
      />
    ));
    const input = within(container).getByRole("spinbutton", {
      name: "Duration",
    });

    await user.clear(input);
    await user.type(input, "45");
    expect(onValueChange).toHaveBeenLastCalledWith(45);
  });

  it("restores the canonical value on blur after clearing", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <EditableNumberInput aria-label="Duration" value={30} onValueChange={() => {}} />
    ));
    const input = within(container).getByRole("spinbutton", {
      name: "Duration",
    });

    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(30);
  });

  it("syncs draft text when the external value changes while unfocused", () => {
    const [value, setValue] = createSignal(30);
    const container = render(() => (
      <EditableNumberInput
        aria-label="Duration"
        value={value()}
        onValueChange={() => {}}
      />
    ));
    const input = within(container).getByRole("spinbutton", {
      name: "Duration",
    });

    setValue(60);
    flush();
    expect(input).toHaveValue(60);
  });

  it("does not overwrite a focused draft when the external value changes", async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal(30);
    const container = render(() => (
      <EditableNumberInput
        aria-label="Duration"
        value={value()}
        onValueChange={() => {}}
      />
    ));
    const input = within(container).getByRole("spinbutton", {
      name: "Duration",
    });

    input.focus();
    await user.type(input, "7");
    setValue(60);
    flush();
    expect(input).toHaveValue(307);
  });

  it("has no axe violations", async () => {
    render(() => (
      <EditableNumberInput aria-label="Duration" value={30} onValueChange={() => {}} />
    ));

    await expectNoA11yViolations();
  });
});
