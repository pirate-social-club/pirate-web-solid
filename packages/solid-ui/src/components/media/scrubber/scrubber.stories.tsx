import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

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
      <div class="max-w-xl space-y-3 rounded-[var(--radius-xl)] border border-border-soft bg-card p-5">
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
      <div class="flex max-w-xl flex-col gap-6">
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
};

export const Disabled: Story = {
  render: () => (
    <Scrubber value={50} showThumb disabled ariaLabel="Playback position" />
  ),
};
