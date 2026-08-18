import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./select";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const sortOptions = [
  { value: "new", label: "Newest" },
  { value: "top", label: "Top rated" },
  { value: "old", label: "Oldest", disabled: true },
];

const optionValue = (option: { value: string }) => option.value;
const optionLabel = (option: { label: string }) => option.label;
const optionDisabled = (option: { disabled?: boolean }) => option.disabled ?? false;

describe("Select", () => {
  it("renders a combobox trigger and a hidden select for form submission", () => {
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Pick one"
      />
    ));

    const view = within(container);
    expect(view.getByRole("button", { name: "Sort order" })).toBeInTheDocument();
    expect(container.querySelector("select")).toBeInTheDocument();
  });

  it("shows the placeholder while no option is selected", () => {
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Pick one"
      />
    ));

    expect(within(container).getByText("Pick one")).toBeInTheDocument();
  });

  it("opens the listbox and selects an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Pick one"
        onChange={onChange}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Sort order" }));
    const option = await screen.findByRole("option", { name: "Top rated" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("top");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("reflects a controlled value in the trigger", () => {
    const [value, setValue] = createSignal<string | null>("top");
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        value={value()}
        onChange={(next) => setValue(next)}
      />
    ));
    flush();

    const trigger = within(container).getByRole("button", { name: "Sort order" });
    expect(trigger).toHaveTextContent("Top rated");
  });

  it("supports disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        optionDisabled={optionDisabled}
        placeholder="Pick one"
        onChange={onChange}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Sort order" }));
    const option = await screen.findByRole("option", { name: "Oldest" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await user.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports the disabled state", () => {
    const container = render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        disabled
      />
    ));

    expect(within(container).getByRole("button")).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <Select
        aria-label="Sort order"
        options={sortOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Pick one"
      />
    ));

    await expectNoA11yViolations();
  });
});
