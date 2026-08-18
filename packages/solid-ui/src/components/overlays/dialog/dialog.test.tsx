import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "@/components/actions/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useDialogContext,
} from "./dialog";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function FooterActions() {
  const context = useDialogContext();

  return (
    <DialogFooter>
      <Button variant="outline" onClick={() => context.close()}>
        Cancel
      </Button>
      <Button onClick={() => context.close()}>Save changes</Button>
    </DialogFooter>
  );
}

function renderDialog() {
  const container = render(() => (
    <Dialog>
      <DialogTrigger class={buttonVariants({ variant: "default" })}>
        Open dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes to your profile here.</DialogDescription>
        </DialogHeader>
        <p class="text-base">Body content.</p>
        <FooterActions />
      </DialogContent>
    </Dialog>
  ));
  return container;
}

describe("Dialog", () => {
  it("opens from the trigger and names the dialog from its title", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAccessibleName("Edit profile");
    expect(dialog).toHaveAccessibleDescription(/Make changes to your profile/);
  });

  it("announces the close control as Close and the footer actions by their visible labels", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
  });

  it("moves focus into the dialog and traps Tab within it", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    const dialog = screen.getByRole("dialog");
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const container = renderDialog();
    const trigger = within(container).getByRole("button", { name: "Open dialog" });

    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes from the header close button", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from a footer action that uses the dialog context", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = renderDialog();

    await user.click(within(container).getByRole("button", { name: "Open dialog" }));
    await screen.findByRole("dialog");

    await expectNoA11yViolations();
  });
});
