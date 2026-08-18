import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { buttonVariants } from "@/components/actions/button/button";
import { StoryDialogFooter } from "@/stories/lib/dialog-footer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

interface DialogStoryArgs {
  title: string;
  description: string;
  hideCloseButton: boolean;
  footer: boolean;
}

const meta = {
  title: "Components/Overlays/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  args: {
    title: "Edit profile",
    description: "Make changes to your profile here. Click save when you're done.",
    hideCloseButton: false,
    footer: true,
  } satisfies DialogStoryArgs,
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    hideCloseButton: { control: "boolean" },
    footer: { control: "boolean" },
  },
  render: (args) => (
    <Dialog>
      <DialogTrigger class={buttonVariants({ variant: "default" })}>
        Open dialog
      </DialogTrigger>
      <DialogContent hideCloseButton={args.hideCloseButton}>
        <DialogHeader>
          <DialogTitle>{args.title}</DialogTitle>
          <DialogDescription>{args.description}</DialogDescription>
        </DialogHeader>
        {args.footer ? (
          <StoryDialogFooter
            as={DialogFooter}
            confirmLabel="Save"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Modal surface for ordinary content that needs focused attention without interrupting a destructive flow. Compose Dialog with DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, and DialogFooter. Close with the header close button, a footer Button calling the dialog context close, or Escape. For interruptive confirmations, use AlertDialog instead.",
      },
    },
  },
} satisfies Meta<DialogStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(trigger);

    const dialog = await body.findByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Edit profile");
    await expect(dialog).toHaveAccessibleDescription(/Make changes/);

    await expect(body.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(body.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Save" }),
    ).toBeVisible();

    await expect(document.activeElement).toBe(
      body.getByRole("button", { name: "Close" }),
    );

    await userEvent.tab();
    await expect(document.activeElement).toBe(
      body.getByRole("button", { name: "Cancel" }),
    );
    await userEvent.tab();
    await expect(document.activeElement).toBe(
      body.getByRole("button", { name: "Save" }),
    );
    await userEvent.tab();
    await expect(document.activeElement).toBe(
      body.getByRole("button", { name: "Close" }),
    );

    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const LongContent: Story = {
  args: {
    title: "Release notes",
    description:
      "A longer dialog with scrollable content keeps its header, footer, and close button available.",
    footer: false,
  },
  render: (args) => (
    <Dialog>
      <DialogTrigger class={buttonVariants({ variant: "outline" })}>
        Open release notes
      </DialogTrigger>
      <DialogContent hideCloseButton={args.hideCloseButton} class="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{args.title}</DialogTitle>
          <DialogDescription>{args.description}</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3 py-2 text-base">
          <p>This release adds a redesigned player queue with drag reordering.</p>
          <p>Search now highlights exact matches and supports transliteration.</p>
          <p>Notifications can be paused per community for up to 30 days.</p>
          <p>Fixed a crash when opening a study session from a deep link.</p>
          <p>Fixed an issue where cached artwork showed stale covers after an update.</p>
          <p>Performance work reduced the first feed render on mid-range devices.</p>
          <p>Translations for Arabic and Hebrew were reviewed and updated.</p>
          <p>Tip: swipe a row in the queue to reveal quick actions.</p>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

export const Mobile: Story = {
  parameters: {
    globals: { viewport: "mobile1" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await body.findByRole("dialog");

    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const RightToLeft: Story = {
  globals: {
    direction: "rtl",
    locale: "ar",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await body.findByRole("dialog");

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
