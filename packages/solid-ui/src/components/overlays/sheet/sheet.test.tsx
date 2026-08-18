import { screen, waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  useDialogContext,
} from "./sheet";
import { buttonVariants } from "@/components/actions/button/button";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function FooterActions() {
  const context = useDialogContext();

  return (
    <SheetFooter>
      <button
        class={buttonVariants({ variant: "outline" })}
        onClick={() => context.close()}
        type="button"
      >
        Cancel
      </button>
      <button class={buttonVariants({ variant: "default" })} type="button">
        Confirm
      </button>
    </SheetFooter>
  );
}

function SheetFixture(props: {
  side?: "top" | "bottom" | "left" | "right";
  hideCloseButton?: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger class={buttonVariants({ variant: "outline" })}>
        Open sheet
      </SheetTrigger>
      <SheetContent side={props.side ?? "right"} hideCloseButton={props.hideCloseButton}>
        <SheetHeader>
          <SheetTitle>Confirm purchase</SheetTitle>
          <SheetDescription>Review the details before you continue.</SheetDescription>
        </SheetHeader>
        <div class="py-4">
          <p class="text-base text-muted-foreground">Body content.</p>
        </div>
        <FooterActions />
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("opens from the trigger with an accessible dialog name", async () => {
    const user = userEvent.setup();
    const container = render(() => <SheetFixture />);

    expect(within(container).queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(container).getByRole("button", { name: "Open sheet" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAccessibleName("Confirm purchase");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    const container = render(() => <SheetFixture />);

    const trigger = within(container).getByRole("button", { name: "Open sheet" });
    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("closes from the footer close part", async () => {
    const user = userEvent.setup();
    const container = render(() => <SheetFixture />);

    await user.click(within(container).getByRole("button", { name: "Open sheet" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    flush();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("omits the close button when hidden", async () => {
    const user = userEvent.setup();
    const container = render(() => <SheetFixture hideCloseButton />);

    await user.click(within(container).getByRole("button", { name: "Open sheet" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("supports all four sides", async () => {
    const user = userEvent.setup();
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const container = render(() => <SheetFixture side={side} />);
      await user.click(within(container).getByRole("button", { name: "Open sheet" }));
      expect(await screen.findByRole("dialog")).toBeVisible();
      await user.keyboard("{Escape}");
      flush();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it("has no axe violations when open", async () => {
    const user = userEvent.setup();
    const container = render(() => <SheetFixture />);
    await user.click(within(container).getByRole("button", { name: "Open sheet" }));
    await screen.findByRole("dialog");

    await expectNoA11yViolations();
  });
});
