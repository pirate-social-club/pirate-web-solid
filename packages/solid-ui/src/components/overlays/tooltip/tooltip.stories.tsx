import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { IconButton } from "@/components/actions/icon-button/icon-button";
import { IconX } from "@/components/media/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const meta = {
  title: "Components/Overlays/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  args: {
    openDelay: 0,
    closeDelay: 0,
  },
  argTypes: {
    openDelay: { control: "number" },
    closeDelay: { control: "number" },
  },
  render: (args) => (
    <Tooltip {...args}>
      <TooltipTrigger as={IconButton} aria-label="Close dialog">
        <IconX class="size-5" />
      </TooltipTrigger>
      <TooltipContent>Close dialog</TooltipContent>
    </Tooltip>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Hover-and-focus label for controls that need extra context. TooltipTrigger composes over any focusable element; the content should be short auxiliary copy, never the only source of an essential instruction. Use aria-label for the accessible name and let the tooltip repeat or extend it.",
      },
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const trigger = canvas.getByRole("button", { name: "Close dialog" });
    await userEvent.hover(trigger);

    const tooltip = await body.findByRole("tooltip");
    await waitFor(() => expect(tooltip).toBeVisible());
    await expect(tooltip).toHaveTextContent("Close dialog");

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );

    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toBeVisible(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  },
};
