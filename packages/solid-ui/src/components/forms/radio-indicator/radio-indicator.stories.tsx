import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { StoryRow } from "@/stories/lib/story-layout";
import { RadioIndicator } from "./radio-indicator";

const meta = {
  title: "Components/Forms/RadioIndicator",
  component: RadioIndicator,
  tags: ["autodocs"],
  args: {
    checked: false,
  },
  argTypes: {
    checked: { control: "boolean" },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The round selection dot used by option surfaces such as OptionCard. Purely presentational and hidden from assistive technology; the selection semantics belong to the host control. Do not use it as a standalone radio button.",
      },
    },
  },
} satisfies Meta<typeof RadioIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <StoryRow>
      <RadioIndicator checked={args.checked} />
      <span class="text-base font-medium text-foreground">Select a plan</span>
    </StoryRow>
  ),
};

export const Variants: Story = {
  render: () => (
    <StoryRow>
      <RadioIndicator />
      <RadioIndicator checked />
    </StoryRow>
  ),
};
