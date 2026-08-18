import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { OptionCard } from "./option-card";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("OptionCard", () => {
  it("renders a button with title and description", () => {
    const container = render(() => (
      <OptionCard title="Monthly" description="Billed every month." />
    ));

    const view = within(container);
    expect(view.getByRole("button", { name: /Monthly/ })).toBeInTheDocument();
    expect(view.getByText("Billed every month.")).toBeInTheDocument();
  });

  it("fires the click callback and reflects the selected state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const container = render(() => (
      <OptionCard title="Monthly" selected onClick={onClick} />
    ));

    expect(container.querySelector("[data-checked]")).not.toBeNull();

    await user.click(within(container).getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a leading icon with a trailing indicator", () => {
    const container = render(() => (
      <OptionCard title="Monthly" icon={<span>ICON</span>} selected />
    ));

    expect(within(container).getByText("ICON")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-checked]").length).toBe(1);
  });

  it("supports the disabled state with a hint", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const container = render(() => (
      <OptionCard
        title="Yearly"
        disabled
        disabledHint="Not available in your region."
        onClick={onClick}
      />
    ));

    const view = within(container);
    expect(view.getByRole("button")).toBeDisabled();
    expect(view.getByText("Not available in your region.")).toBeInTheDocument();

    await user.click(view.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    render(() => (
      <OptionCard title="Monthly" description="Billed every month." />
    ));

    await expectNoA11yViolations();
  });
});
