import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { IconCheck, IconX } from "@/components/media/icons";
import { IconButton } from "./icon-button";

const meta = {
  title: "Components/Actions/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  args: {
    "aria-label": "Close dialog",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "outline", "ghost", "destructive"],
    },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Icon-only circle button for obvious tool actions. Every IconButton needs an accessible name: pass aria-label or wrap in an overlay part that provides one. The optional active prop turns it into a toggle button (aria-pressed) for persistent states like shuffle or repeat. Use Button for labeled actions. Reuses the Button visual language at icon size.",
      },
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <IconButton {...args}>
      <IconX class="size-5" />
    </IconButton>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Close dialog" });

    await expect(button).toBeVisible();
    await userEvent.click(button);
    await expect(button).toHaveFocus();
    await userEvent.tab();
    await expect(button).not.toHaveFocus();
  },
};

export const Variants: Story = {
  render: (args) => (
    <div class="flex flex-wrap gap-3">
      <IconButton {...args} aria-label="Default">
        <IconCheck class="size-5" />
      </IconButton>
      <IconButton {...args} aria-label="Secondary" variant="secondary">
        <IconCheck class="size-5" />
      </IconButton>
      <IconButton {...args} aria-label="Outline" variant="outline">
        <IconCheck class="size-5" />
      </IconButton>
      <IconButton {...args} aria-label="Ghost" variant="ghost">
        <IconCheck class="size-5" />
      </IconButton>
      <IconButton {...args} aria-label="Destructive" variant="destructive">
        <IconX class="size-5" />
      </IconButton>
      <IconButton {...args} aria-label="Active" variant="secondary" active>
        <IconCheck class="size-5" />
      </IconButton>
    </div>
  ),
};

export const Loading: Story = {
  args: {
    loading: true,
  },
  render: (args) => (
    <IconButton {...args}>
      <IconX class="size-5" />
    </IconButton>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Close dialog" });

    await waitFor(() => expect(button).toBeDisabled());
    await expect(button).toHaveAttribute("aria-busy");
  },
};
