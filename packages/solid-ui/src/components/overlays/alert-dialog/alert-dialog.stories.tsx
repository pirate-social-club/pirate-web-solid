import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { buttonVariants } from "@/components/actions/button/button";
import { StoryDialogFooter } from "@/stories/lib/dialog-footer";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

interface AlertDialogStoryArgs {
  title: string;
  description: string;
  destructive: boolean;
}

const meta = {
  title: "Components/Overlays/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
  args: {
    title: "Remove this song?",
    description:
      "This song will be removed from your list and its cached audio deleted.",
    destructive: false,
  } satisfies AlertDialogStoryArgs,
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    destructive: { control: "boolean" },
  },
  render: (args) => (
    <AlertDialog>
      <AlertDialogTrigger class={buttonVariants({ variant: "default" })}>
        Open alert
      </AlertDialogTrigger>
      <AlertDialogContent hideCloseButton>
        <AlertDialogHeader>
          <AlertDialogTitle>{args.title}</AlertDialogTitle>
          <AlertDialogDescription>{args.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <StoryDialogFooter
          as={AlertDialogFooter}
          destructive={args.destructive}
        />
      </AlertDialogContent>
    </AlertDialog>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Interruptive modal with role=alertdialog for confirmations and consequential actions. Announce the title and description on open, and provide explicit Cancel and confirm actions: never model the affirmative action as a close button. Use the plain Dialog for ordinary modal content.",
      },
    },
  },
} satisfies Meta<AlertDialogStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const trigger = canvas.getByRole("button", { name: "Open alert" });
    await userEvent.click(trigger);

    const dialog = await body.findByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Remove this song?");
    await expect(dialog).toHaveAccessibleDescription(/removed from your list/);

    const cancel = body.getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeVisible();

    await userEvent.click(cancel);
    await expect(body.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(trigger).toHaveFocus();
  },
};

export const Mobile: Story = {
  parameters: {
    globals: { viewport: "mobile1" },
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

    await userEvent.click(canvas.getByRole("button", { name: "Open alert" }));
    await body.findByRole("alertdialog");

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await expect(body.queryByRole("alertdialog")).not.toBeInTheDocument();
  },
};
