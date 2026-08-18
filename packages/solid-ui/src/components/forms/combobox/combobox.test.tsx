import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Combobox } from "./combobox";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const songOptions = [
  { value: "neon", label: "Neon Skyline" },
  { value: "harbor", label: "Harbor Lights" },
  { value: "tide", label: "Tide and Time", disabled: true },
];

const optionValue = (option: { value: string }) => option.value;
const optionLabel = (option: { label: string }) => option.label;
const optionDisabled = (option: { disabled?: boolean }) => option.disabled ?? false;

describe("Combobox", () => {
  it("renders a named combobox input and a hidden select", () => {
    const container = render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Search songs"
      />
    ));

    const view = within(container);
    expect(view.getByRole("combobox", { name: "Pick a song" })).toBeInTheDocument();
    expect(container.querySelector("select")).toBeInTheDocument();
  });

  it("opens the listbox and commits a picked option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Search songs"
        onChange={onChange}
      />
    ));

    await user.click(within(container).getByRole("button"));
    const option = await screen.findByRole("option", { name: "Harbor Lights" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("harbor");
  });

  it("reflects a controlled value in the input", () => {
    const container = render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        value="harbor"
        onChange={() => {}}
      />
    ));
    flush();

    const input = within(container).getByRole("combobox", { name: "Pick a song" });
    expect(input).toHaveValue("Harbor Lights");
  });

  it("supports disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        optionDisabled={optionDisabled}
        placeholder="Search songs"
        onChange={onChange}
      />
    ));

    await user.click(within(container).getByRole("button"));
    const option = await screen.findByRole("option", { name: "Tide and Time" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await user.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports the disabled state", () => {
    const container = render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        disabled
      />
    ));

    expect(within(container).getByRole("combobox")).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <Combobox
        aria-label="Pick a song"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Search songs"
      />
    ));

    await expectNoA11yViolations();
  });
});
