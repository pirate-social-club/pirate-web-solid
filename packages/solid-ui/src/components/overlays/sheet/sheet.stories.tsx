import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { buttonVariants } from "@/components/actions/button/button";
import { StoryDialogFooter } from "@/stories/lib/dialog-footer";
import { StoryStack } from "@/stories/lib/story-layout";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

interface SheetStoryArgs {
  side: "top" | "bottom" | "left" | "right";
}

const meta = {
  title: "Components/Overlays/Sheet",
  component: Sheet,
  tags: ["autodocs"],
  args: {
    side: "right",
  } satisfies SheetStoryArgs,
  argTypes: {
    side: {
      control: "select",
      options: ["top", "bottom", "left", "right"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Side panel dialog built on the Kobalte Dialog with `top`, `bottom`, `left`, and `right` variants. Compose with `SheetHeader`/`SheetTitle`/`SheetDescription`, body content, and `SheetFooter` actions. Focus returns to the trigger on close.",
      },
    },
  },
} satisfies Meta<SheetStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

function SheetTemplate(props: { side: "top" | "bottom" | "left" | "right" }) {
  return (
    <Sheet>
      <SheetTrigger class={buttonVariants({ variant: "outline" })}>
        Open ({props.side})
      </SheetTrigger>
      <SheetContent side={props.side}>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>
            This is a sheet sliding in from the {props.side}.
          </SheetDescription>
        </SheetHeader>
        <div class="py-4">
          <p class="text-base text-muted-foreground">
            Sheet body content goes here.
          </p>
        </div>
        <StoryDialogFooter as={SheetFooter} />
      </SheetContent>
    </Sheet>
  );
}

export const Default: Story = {
  render: () => <SheetTemplate side="right" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open (right)" }));
    const dialog = await body.findByRole("dialog", { name: "Sheet Title" });
    await expect(dialog).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <SheetTemplate side="right" />
      <SheetTemplate side="left" />
      <SheetTemplate side="bottom" />
      <SheetTemplate side="top" />
    </StoryStack>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <SheetTemplate side="right" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open (right)" }));
    const dialog = await body.findByRole("dialog", { name: "Sheet Title" });
    await expect(dialog).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
