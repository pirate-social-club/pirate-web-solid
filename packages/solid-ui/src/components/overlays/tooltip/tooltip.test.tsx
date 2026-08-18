import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "@/components/actions/icon-button/icon-button";
import { IconX } from "@/components/media/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderTooltip() {
  return render(() => (
    <Tooltip openDelay={0} closeDelay={0}>
      <TooltipTrigger as={IconButton} aria-label="Close dialog">
        <IconX class="size-5" />
      </TooltipTrigger>
      <TooltipContent>Close dialog</TooltipContent>
    </Tooltip>
  ));
}

describe("Tooltip", () => {
  it("opens on hover and describes the trigger", async () => {
    const user = userEvent.setup();
    const container = renderTooltip();

    const trigger = within(container).getByRole("button", { name: "Close dialog" });
    await user.hover(trigger);

    const tooltip = await screen.findByRole("tooltip");
    await vi.waitFor(() => expect(tooltip).toBeVisible());
    expect(tooltip).toHaveTextContent("Close dialog");
    await vi.waitFor(() =>
      expect(trigger).toHaveAccessibleDescription("Close dialog"),
    );
  });

  it("opens on keyboard focus", async () => {
    const user = userEvent.setup();
    const container = renderTooltip();

    const trigger = within(container).getByRole("button", { name: "Close dialog" });
    await user.tab();
    expect(trigger).toHaveFocus();

    await vi.waitFor(() => expect(screen.getByRole("tooltip")).toBeVisible());
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const container = renderTooltip();

    const trigger = within(container).getByRole("button", { name: "Close dialog" });
    await user.hover(trigger);
    await screen.findByRole("tooltip");

    await user.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = renderTooltip();

    await user.hover(
      within(container).getByRole("button", { name: "Close dialog" }),
    );
    await screen.findByRole("tooltip");

    await expectNoA11yViolations();
  });
});
