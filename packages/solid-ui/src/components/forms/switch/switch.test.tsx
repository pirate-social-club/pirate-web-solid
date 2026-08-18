import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Switch, SwitchDescription, SwitchLabel } from "./switch";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Switch", () => {
  it("renders a named switch input", () => {
    const container = render(() => <Switch aria-label="Dark mode" />);

    expect(
      within(container).getByRole("switch", { name: "Dark mode" }),
    ).toBeInTheDocument();
  });

  it("toggles on control click and reports boolean state", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const onChange = vi.fn((next: boolean) => setChecked(next));
    const container = render(() => (
      <Switch aria-label="Dark mode" checked={checked()} onChange={onChange} />
    ));
    flush();

    const input = within(container).getByRole("switch", { name: "Dark mode" });

    await user.click(input);
    expect(onChange).toHaveBeenLastCalledWith(true);
    await user.click(input);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("toggles with Space while the input is focused", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const container = render(() => (
      <Switch
        aria-label="Dark mode"
        checked={checked()}
        onChange={(next) => setChecked(next)}
      />
    ));
    flush();

    const input = within(container).getByRole("switch", { name: "Dark mode" });
    input.focus();
    await user.keyboard(" ");

    expect(screen.getByRole("switch", { name: "Dark mode" })).toBeChecked();
  });

  it("exposes the checked state on the track and thumb", () => {
    const container = render(() => <Switch aria-label="Dark mode" checked />);
    flush();

    const input = within(container).getByRole("switch", { name: "Dark mode" });
    expect(input).toBeChecked();
    expect(container.querySelectorAll("[data-checked]").length).toBeGreaterThan(0);
  });

  it("associates a label and description", () => {
    const container = render(() => (
      <Switch>
        <div class="flex flex-col">
          <SwitchLabel>Dark mode</SwitchLabel>
          <SwitchDescription>Use a darker color scheme.</SwitchDescription>
        </div>
      </Switch>
    ));
    flush();

    const view = within(container);
    expect(view.getByRole("switch", { name: "Dark mode" })).toBeInTheDocument();
    expect(view.getByText("Use a darker color scheme.")).toBeInTheDocument();
  });

  it("supports the disabled state", () => {
    const container = render(() => <Switch aria-label="Dark mode" disabled />);

    expect(
      within(container).getByRole("switch", { name: "Dark mode" }),
    ).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => <Switch aria-label="Dark mode" />);

    await expectNoA11yViolations();
  });
});
