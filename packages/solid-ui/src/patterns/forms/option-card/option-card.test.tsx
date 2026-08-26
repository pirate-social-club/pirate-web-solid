import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { OptionCard, OptionCardGroup } from "./option-card";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderGroup(options?: { disabled?: boolean; onChange?: (value: string) => void }) {
  return render(() => {
    const [value, setValue] = createSignal("monthly");
    return (
      <OptionCardGroup
        label="Billing cadence"
        onChange={(next) => {
          setValue(next);
          options?.onChange?.(next);
        }}
        value={value()}
      >
        <OptionCard description="Billed every week." title="Weekly" value="weekly" />
        <OptionCard description="Billed every month." title="Monthly" value="monthly" />
        <OptionCard
          disabled={options?.disabled}
          disabledHint={options?.disabled ? "Not available in your region." : undefined}
          title="Yearly"
          value="yearly"
        />
      </OptionCardGroup>
    );
  });
}

describe("OptionCard", () => {
  it("renders a named radiogroup of radios", () => {
    const view = within(renderGroup());
    expect(view.getByRole("radiogroup", { name: "Billing cadence" })).toBeInTheDocument();
    expect(view.getAllByRole("radio")).toHaveLength(3);
    expect(view.getByText("Billed every month.")).toBeInTheDocument();
  });

  it("reflects and changes the group's selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = within(renderGroup({ onChange }));

    expect(view.getByRole("radio", { name: /Monthly/ })).toBeChecked();
    await user.click(view.getByRole("radio", { name: /Weekly/ }));
    expect(onChange).toHaveBeenCalledWith("weekly");
    expect(view.getByRole("radio", { name: /Weekly/ })).toBeChecked();
  });

  // The whole point of composing Kobalte's RadioGroup: one tab stop, arrow
  // keys move and select, rather than hand-assigned ARIA on plain buttons.
  it("is one tab stop with arrow-key selection", async () => {
    const user = userEvent.setup();
    const view = within(renderGroup());

    await user.tab();
    expect(view.getByRole("radio", { name: /Monthly/ })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(view.getByRole("radio", { name: /Yearly/ })).toBeChecked();

    await user.tab();
    expect(view.getByRole("radio", { name: /Weekly/ })).not.toHaveFocus();
    expect(view.getByRole("radio", { name: /Yearly/ })).not.toHaveFocus();
  });

  it("supports a disabled option with a hint", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = within(renderGroup({ disabled: true, onChange }));

    expect(view.getByRole("radio", { name: /Yearly/ })).toBeDisabled();
    expect(view.getByText("Not available in your region.")).toBeInTheDocument();

    await user.click(view.getByRole("radio", { name: /Yearly/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    renderGroup();
    await expectNoA11yViolations();
  });
});
