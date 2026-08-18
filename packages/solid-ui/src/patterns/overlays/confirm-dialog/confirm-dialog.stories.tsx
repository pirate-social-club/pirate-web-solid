import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "Patterns/Overlays/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  args: {
    title: "Delete this song?",
    description: "This will remove the song from your list. You can add it back later.",
    confirmLabel: "Delete",
    cancelLabel: "Keep",
    triggerLabel: "Delete song",
    destructive: false,
    onConfirm: fn(),
  },
  argTypes: {
    destructive: { control: "boolean" },
    onConfirm: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Reusable interruption pattern built on AlertDialog. Pass a title, description, and an onConfirm callback; the pattern renders the trigger, cancel, and confirm actions and closes itself. It must not mount a toaster or emit notifications: feedback belongs to the caller.",
      },
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Delete song" }));

    const dialog = await body.findByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Delete this song?");

    await userEvent.click(body.getByRole("button", { name: "Delete" }));

    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(body.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(body.queryByRole("region")).not.toBeInTheDocument();
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
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

    await userEvent.click(canvas.getByRole("button", { name: "Delete song" }));
    await body.findByRole("alertdialog");

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await userEvent.click(body.getByRole("button", { name: "Delete" }));
    await expect(body.queryByRole("alertdialog")).not.toBeInTheDocument();
  },
};
