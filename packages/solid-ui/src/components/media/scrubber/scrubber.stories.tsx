import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { boardWidth, widthOf } from "@/stories/lib/story-measure";
import { Scrubber } from "./scrubber";

const meta = {
  title: "Components/Media/Scrubber",
  component: Scrubber,
  tags: ["autodocs"],
  args: {
    max: 100,
    showThumb: false,
    value: 32,
    step: 1,
    showValueBubble: false,
    disabled: false,
  },
  argTypes: {
    max: { control: "number" },
    value: { control: "number" },
    step: { control: "number" },
    showThumb: { control: "boolean" },
    showValueBubble: { control: "boolean" },
    disabled: { control: "boolean" },
    onChange: { table: { disable: true } },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Playback-style range control built on the Kobalte Slider. Controlled via `value`/`onChange`; the thumb appears on hover and stays visible while focused. Set `ariaLabel` for an accessible name and `valueLabel` plus `showValueBubble` for the drag bubble. Keyboard: arrow keys step, Home/End jump to min/max.",
      },
    },
  },
} satisfies Meta<typeof Scrubber>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = createSignal(args.value);
    return (
      <div
        class="w-[36rem] max-w-full space-y-3 rounded-[var(--radius-xl)] border border-border-soft bg-card p-5"
        data-testid="scrubber-card"
      >
        <div class="flex items-center justify-between text-base text-muted-foreground">
          <span>Playback</span>
          <span>{value()}%</span>
        </div>
        <Scrubber
          {...args}
          value={value()}
          onChange={(next) => setValue(next)}
          ariaLabel="Playback position"
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const slider = canvas.getByRole("slider", { name: "Playback position" });
    await expect(slider).toHaveAttribute("aria-valuenow", "32");
    // Paper draws the card 576px wide; the centered layout must not collapse it.
    await expect(widthOf(canvas.getByTestId("scrubber-card"))).toBe(boardWidth(576));
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(slider).toHaveAttribute("aria-valuenow", "33");
  },
};

export const Variants: Story = {
  render: () => {
    const [bubbleValue, setBubbleValue] = createSignal(42);
    const [thumbValue, setThumbValue] = createSignal(68);
    return (
      <div class="flex w-[36rem] max-w-full flex-col gap-10 pt-10" data-testid="scrubber-variants">
        <Scrubber
          value={thumbValue()}
          onChange={setThumbValue}
          showThumb
          ariaLabel="Visible thumb"
        />
        <Scrubber
          value={bubbleValue()}
          onChange={setBubbleValue}
          showThumb
          showValueBubble
          valueLabel="0:42"
          ariaLabel="Value bubble"
          ariaValueText="42 seconds"
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("scrubber-variants");
    await expect(widthOf(frame)).toBe(boardWidth(576));
    // Each slider root (and so its w-full track) spans the frame.
    for (const root of Array.from(frame.children)) {
      await expect(widthOf(root)).toBe(boardWidth(576));
    }
    // Paper shows the value bubble; it appears while the thumb has focus.
    canvas.getByRole("slider", { name: "Value bubble" }).focus();
    await expect(await canvas.findByText("0:42")).toBeVisible();
  },
};

export const Disabled: Story = {
  render: () => (
    <div class="w-[36rem] max-w-full" data-testid="scrubber-disabled">
      <Scrubber value={50} showThumb disabled ariaLabel="Playback position" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("scrubber-disabled");
    await expect(widthOf(frame)).toBe(boardWidth(576));
    await expect(frame.firstElementChild).not.toBeNull();
    await expect(widthOf(frame.firstElementChild as Element)).toBe(boardWidth(576));
  },
};
