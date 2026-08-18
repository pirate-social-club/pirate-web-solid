import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { CheckboxCard } from "./checkbox-card";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("CheckboxCard", () => {
  it("renders a named checkbox with title and description", () => {
    const container = render(() => (
      <CheckboxCard
        title="Accept terms"
        description="You must accept to continue."
      />
    ));

    const view = within(container);
    expect(view.getByRole("checkbox", { name: "Accept terms" })).toBeInTheDocument();
    expect(view.getByText("You must accept to continue.")).toBeInTheDocument();
  });

  it("toggles when the card text is clicked", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const container = render(() => (
      <CheckboxCard
        title="Accept terms"
        checked={checked()}
        onCheckedChange={setChecked}
      />
    ));
    flush();

    await user.click(within(container).getByText("Accept terms"));
    expect(checked()).toBe(true);

    await user.click(within(container).getByText("Accept terms"));
    expect(checked()).toBe(false);
  });

  it("toggles with Space when the input is focused", async () => {
    const user = userEvent.setup();
    const [checked, setChecked] = createSignal(false);
    const container = render(() => (
      <CheckboxCard
        title="Accept terms"
        checked={checked()}
        onCheckedChange={setChecked}
      />
    ));
    flush();

    const input = within(container).getByRole("checkbox", { name: "Accept terms" });
    input.focus();
    await user.keyboard(" ");

    expect(checked()).toBe(true);
  });

  it("supports the disabled state with a hint", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const container = render(() => (
      <CheckboxCard
        title="Accept terms"
        disabled
        disabledHint="Requires a verified account."
        onCheckedChange={onCheckedChange}
      />
    ));

    const view = within(container);
    expect(view.getByRole("checkbox", { name: "Accept terms" })).toBeDisabled();
    expect(view.getByText("Requires a verified account.")).toBeInTheDocument();

    await user.click(view.getByText("Accept terms"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <CheckboxCard
        title="Accept terms"
        description="You must accept to continue."
      />
    ));

    await expectNoA11yViolations();
  });
});
