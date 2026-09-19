import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { createSignal, flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { MultiCombobox } from "./multi-combobox";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const songOptions = [
  { value: "neon", label: "Neon Skyline" },
  { value: "harbor", label: "Harbor Lights" },
  { value: "tide", label: "Tide and Time", disabled: true },
];

const optionValue = (option: { value: string }) => option.value;
const optionLabel = (option: { label: string }) => option.label;
const optionDisabled = (option: { disabled?: boolean }) => option.disabled ?? false;

describe("MultiCombobox", () => {
  it("renders a named combobox input and a hidden select", () => {
    const container = render(() => (
      <MultiCombobox
        aria-label="Allowed nationalities"
        name="countries"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        placeholder="Search"
      />
    ));

    const view = within(container);
    expect(view.getByRole("combobox", { name: "Allowed nationalities" })).toBeInTheDocument();
    expect(container.querySelector('select[name="countries"]')).toBeInTheDocument();
  });

  it("adds a chip for a picked option and reports every value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => {
      const [values, setValues] = createSignal<string[]>([]);
      return (
        <MultiCombobox
          aria-label="Allowed nationalities"
          options={songOptions}
          optionValue={optionValue}
          optionLabel={optionLabel}
          value={values()}
          onChange={(next) => {
            setValues(next);
            onChange(next);
          }}
        />
      );
    });

    const input = within(container).getByRole("combobox", { name: "Allowed nationalities" });
    await user.type(input, "Har");
    await user.click(await screen.findByRole("option", { name: "Harbor Lights" }));

    expect(within(container).getByRole("button", { name: "Remove Harbor Lights" })).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(["harbor"]);
  });

  it("removes a chip and reports the remaining values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => {
      const [values, setValues] = createSignal<string[]>(["harbor", "neon"]);
      return (
        <MultiCombobox
          aria-label="Allowed nationalities"
          options={songOptions}
          optionValue={optionValue}
          optionLabel={optionLabel}
          value={values()}
          onChange={(next) => {
            setValues(next);
            onChange(next);
          }}
        />
      );
    });
    flush();

    expect(within(container).getByRole("button", { name: "Remove Harbor Lights" })).toBeInTheDocument();
    await user.click(within(container).getByRole("button", { name: "Remove Harbor Lights" }));

    expect(onChange).toHaveBeenCalledWith(["neon"]);
    expect(within(container).queryByRole("button", { name: "Remove Harbor Lights" })).toBeNull();
  });

  it("supports disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <MultiCombobox
        aria-label="Allowed nationalities"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        optionDisabled={optionDisabled}
        onChange={onChange}
      />
    ));

    const input = within(container).getByRole("combobox", { name: "Allowed nationalities" });
    await user.type(input, "Tide");
    const option = await screen.findByRole("option", { name: "Tide and Time" });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await user.click(option);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <MultiCombobox
        aria-label="Allowed nationalities"
        options={songOptions}
        optionValue={optionValue}
        optionLabel={optionLabel}
        defaultValue={["harbor"]}
        placeholder="Search"
      />
    ));
    flush();

    await expectNoA11yViolations();
  });
});
