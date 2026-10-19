import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryRow } from "@/stories/lib/story-layout";
import { PirateBrandMark } from "./pirate-brand-mark";

const meta = {
  title: "Patterns/Identity/PirateBrandMark",
  component: PirateBrandMark,
  tags: ["autodocs"],
  args: {
    decorative: true,
  },
  argTypes: {
    decorative: { control: "boolean" },
    alt: { control: "text" },
    class: { control: "text" },
  },
  // Paper's Default is the bare mark at the component's own 40px size.
  render: (args) => (
    <PirateBrandMark
      alt={args.alt}
      class={args.class}
      decorative={args.decorative}
    />
  ),
  parameters: {
    docs: {
      description: {
        component:
          "The product logo mark as a styled image. Decorative by default: the surrounding brand text provides the name, and the image stays hidden from assistive technology. Set `decorative={false}` (optionally with a custom `alt`) when the mark must be announced itself. Use in app chrome and brand panels.",
      },
    },
  },
} satisfies Meta<typeof PirateBrandMark>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const mark = canvas.getByRole("presentation", { hidden: true });
    await expect(mark).toHaveAttribute("alt", "");
    // The bare mark: 40px square, no wordmark beside it.
    await expect(mark.getBoundingClientRect().width).toBe(40);
    await expect(mark.getBoundingClientRect().height).toBe(40);
    await expect(canvas.queryByText("PIRATE")).toBeNull();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow class="items-end">
      <div class="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-border-soft bg-card p-4">
        <PirateBrandMark class="size-8" />
        <span class="text-base text-muted-foreground">Decorative</span>
      </div>
      <div class="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-border-soft bg-card p-4">
        <PirateBrandMark decorative={false} />
        <span class="text-base text-muted-foreground">Named</span>
      </div>
      <div class="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-border-soft bg-card p-4">
        <PirateBrandMark class="size-14" decorative={false} />
        <span class="text-base text-muted-foreground">Large</span>
      </div>
    </StoryRow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Decorative")).toBeVisible();
    const named = canvas.getAllByRole("img", { name: "Pirate" });
    await expect(named).toHaveLength(2);
    for (const mark of named) await expect(mark).toHaveAttribute("alt", "Pirate");
    // Paper sizes the three marks 32, 40 and 56.
    const marks = Array.from(canvasElement.querySelectorAll("img"));
    await expect(marks.map((mark) => mark.getBoundingClientRect().width)).toEqual([32, 40, 56]);
  },
};
