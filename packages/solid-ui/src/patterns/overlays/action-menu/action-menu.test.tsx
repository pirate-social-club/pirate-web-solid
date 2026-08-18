import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { ActionMenu, type ActionMenuItem } from "./action-menu";
import { expectNoA11yViolations, render } from "@/test/test-utils";

const items: ActionMenuItem[] = [
  { key: "view", label: "View details" },
  { key: "edit", label: "Edit" },
  { key: "share", label: "Share", separatorBefore: true },
  { key: "delete", label: "Delete", destructive: true, separatorBefore: true },
  { key: "archive", label: "Archive", disabled: true },
];

describe("ActionMenu", () => {
  it("opens and reports the selected action key", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const container = render(() => <ActionMenu items={items} label="Open menu" onAction={onAction} />);

    await user.click(within(container).getByRole("button", { name: "Open menu" }));
    await screen.findByRole("menu");

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onAction).toHaveBeenCalledWith("edit");
    await vi.waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("marks destructive and disabled items", async () => {
    const user = userEvent.setup();
    const container = render(() => <ActionMenu items={items} label="Open menu" />);

    await user.click(within(container).getByRole("button", { name: "Open menu" }));
    await screen.findByRole("menu");

    const disabledItem = screen.getByRole("menuitem", { name: "Archive" });
    expect(disabledItem).toHaveAttribute("data-disabled", "");

    const destructiveItem = screen.getByRole("menuitem", { name: "Delete" });
    expect(destructiveItem).toHaveClass("text-destructive-text");
  });

  it("renders groups with labels and checked items", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    const container = render(() => (
      <ActionMenu
        groups={[
          {
            label: "Playback",
            items: [
              { key: "shuffle", label: "Shuffle", checked: true },
              { key: "repeat", label: "Repeat" },
            ],
          },
        ]}
        label="Playback options"
        onCheckedChange={onCheckedChange}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Playback options" }));
    await screen.findByRole("menu");

    expect(screen.getByText("Playback")).toBeVisible();
    expect(screen.getByRole("menuitemcheckbox", { name: "Shuffle" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Shuffle" }));
    expect(onCheckedChange).toHaveBeenCalledWith("shuffle", false);
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = render(() => <ActionMenu items={items} label="Open menu" />);

    await user.click(within(container).getByRole("button", { name: "Open menu" }));
    await screen.findByRole("menu");

    await expectNoA11yViolations();
  });
});

describe("ActionMenu trigger and item icons", () => {
  it("renders item icons and a custom trigger with an accessible name", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <ActionMenu
        items={[{ key: "download", label: "Download", icon: <svg data-testid="item-icon" /> }]}
        label="Post options"
        triggerClass="size-9 rounded-full"
        triggerContent={<svg data-testid="trigger-icon" />}
      />
    ));

    const trigger = within(container).getByRole("button", { name: "Post options" });
    expect(within(trigger).getByTestId("trigger-icon")).toBeInTheDocument();

    await user.click(trigger);
    await screen.findByRole("menu");
    expect(screen.getByTestId("item-icon")).toBeInTheDocument();
    await expectNoA11yViolations();
  });
});
