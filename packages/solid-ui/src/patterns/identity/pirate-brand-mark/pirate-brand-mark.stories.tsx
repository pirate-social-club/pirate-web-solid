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
  render: (args) => (
    <div class="flex items-center gap-4 rounded-[var(--radius-xl)] border border-border-soft bg-card p-5">
      <PirateBrandMark
        alt={args.alt}
        class="size-12"
        decorative={args.decorative}
      />
      <span class="text-base font-semibold text-card-foreground">PIRATE</span>
    </div>
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
    await expect(canvas.getByText("PIRATE")).toBeVisible();
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
        <PirateBrandMark class="size-12" decorative={false} />
        <span class="text-base text-muted-foreground">Named</span>
      </div>
      <div class="flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-border-soft bg-card p-4">
        <PirateBrandMark class="size-16" decorative={false} />
        <span class="text-base text-muted-foreground">Large</span>
      </div>
    </StoryRow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Decorative")).toBeVisible();
    const named = canvas.getByRole("img", { name: "Pirate" });
    await expect(named).toHaveAttribute("alt", "Pirate");
  },
};
