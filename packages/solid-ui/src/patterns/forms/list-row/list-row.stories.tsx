import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { IconCaretRight, IconCheckCircle, IconHandPalm } from "@/components/media/icons";
import { StoryStack } from "@/stories/lib/story-layout";
import { ListRow } from "./list-row";

const meta = {
  title: "Patterns/Forms/ListRow",
  component: ListRow,
  tags: ["autodocs"],
  args: { title: "Palm scan" },
  render: (args) => (
    <StoryStack class="w-96">
      <ListRow {...args} />
    </StoryStack>
  ),
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { description: "Members verify they are a real person before joining." },
};

export const WithLeadingAndTrailing: Story = {
  args: {
    leading: <IconHandPalm class="size-6" />,
    trailing: <IconCheckCircle class="size-5 text-muted-foreground" />,
  },
};

export const Navigational: Story = {
  args: {
    leading: <IconHandPalm class="size-6" />,
    trailing: <IconCaretRight class="size-5 text-muted-foreground" />,
    onClick: () => undefined,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: /Palm scan/ })).toBeEnabled();
  },
};

export const Value: Story = {
  args: {
    title: "Study",
    trailing: <span class="text-base font-semibold text-warning">+25 $PIRATE</span>,
  },
};

export const Tones: Story = {
  render: () => (
    <StoryStack class="w-96">
      <ListRow title="Default" tone="default" />
      <ListRow title="Selected" tone="selected" />
      <ListRow title="Muted" tone="muted" />
    </StoryStack>
  ),
};
