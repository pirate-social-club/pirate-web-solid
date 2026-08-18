import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("ConfirmDialog", () => {
  it("opens an alertdialog and confirms through the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const container = render(() => (
      <ConfirmDialog
        title="Delete this song?"
        description="This will remove the song from your list."
        confirmLabel="Delete"
        cancelLabel="Keep"
        triggerLabel="Delete song"
        onConfirm={onConfirm}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Delete song" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAccessibleName("Delete this song?");

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not mount a toaster or emit notifications", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <ConfirmDialog
        title="Delete this song?"
        description="This will remove the song from your list."
        confirmLabel="Delete"
        cancelLabel="Keep"
        triggerLabel="Delete song"
        onConfirm={vi.fn()}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Delete song" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps the destructive confirm action announced with its visible label", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <ConfirmDialog
        title="Leave community?"
        description="You will lose access to this community until you rejoin."
        confirmLabel="Leave"
        cancelLabel="Keep"
        destructive
        triggerLabel="Leave community"
        onConfirm={vi.fn()}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Leave community" }));
    await screen.findByRole("alertdialog");

    expect(screen.getByRole("button", { name: "Leave" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep" })).toBeVisible();
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <ConfirmDialog
        title="Delete this song?"
        description="This will remove the song from your list."
        confirmLabel="Delete"
        cancelLabel="Keep"
        triggerLabel="Delete song"
        onConfirm={vi.fn()}
      />
    ));

    await user.click(within(container).getByRole("button", { name: "Delete song" }));
    await screen.findByRole("alertdialog");

    await expectNoA11yViolations();
  });
});
