import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "@/components/actions/button/button";
import { useDialogContext } from "@/components/overlays/dialog/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function AlertFooter(props: { destructive?: boolean; onConfirm?: () => void }) {
  const context = useDialogContext();

  return (
    <AlertDialogFooter>
      <Button variant="outline" onClick={() => context.close()}>
        Cancel
      </Button>
      <Button
        variant={props.destructive ? "destructive" : "default"}
        onClick={() => {
          props.onConfirm?.();
          context.close();
        }}
      >
        Continue
      </Button>
    </AlertDialogFooter>
  );
}

function renderAlertDialog(props: { destructive?: boolean; onConfirm?: () => void } = {}) {
  return render(() => (
    <AlertDialog>
      <AlertDialogTrigger class={buttonVariants({ variant: "default" })}>
        Open alert
      </AlertDialogTrigger>
      <AlertDialogContent hideCloseButton>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this song?</AlertDialogTitle>
          <AlertDialogDescription>
            This song will be removed from your list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertFooter destructive={props.destructive} onConfirm={props.onConfirm} />
      </AlertDialogContent>
    </AlertDialog>
  ));
}

describe("AlertDialog", () => {
  it("exposes the alertdialog role and announces its title", async () => {
    const user = userEvent.setup();
    const container = renderAlertDialog();

    await user.click(within(container).getByRole("button", { name: "Open alert" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAccessibleName("Remove this song?");
    expect(dialog).toHaveAccessibleDescription(/removed from your list/);
  });

  it("cancels without calling the confirm callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const container = renderAlertDialog({ onConfirm });

    await user.click(within(container).getByRole("button", { name: "Open alert" }));
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("calls the confirm callback and closes", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const container = renderAlertDialog({ onConfirm });

    await user.click(within(container).getByRole("button", { name: "Open alert" }));
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger after closing", async () => {
    const user = userEvent.setup();
    const container = renderAlertDialog();
    const trigger = within(container).getByRole("button", { name: "Open alert" });

    await user.click(trigger);
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = renderAlertDialog();

    await user.click(within(container).getByRole("button", { name: "Open alert" }));
    await screen.findByRole("alertdialog");

    await expectNoA11yViolations();
  });
});
