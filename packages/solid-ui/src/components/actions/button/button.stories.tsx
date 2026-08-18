import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "./button";

const meta = {
  title: "Components/Actions/Button",
  component: Button,
  tags: ["autodocs"],
  args: {
    children: "Continue",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "outline", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    class: { table: { disable: true } },
    leadingIcon: { table: { disable: true } },
    trailingIcon: { table: { disable: true } },
    "aria-busy": { table: { disable: true } },
    ref: { table: { disable: true } },
    tabindex: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The base action control for the app. Use Button for the primary call to action, destructive operations, and secondary, outline, ghost, and link actions. Do not use it as a trigger for menus or overlays: use the trigger part of the overlay component instead.",
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Continue" });

    await userEvent.click(button);
    await expect(button).toHaveFocus();

    await userEvent.tab();
    await expect(button).not.toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex flex-wrap gap-3">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div class="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Add song">
        +
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Disabled" });

    await expect(button).toBeDisabled();
  },
};

export const Loading: Story = {
  render: () => (
    <div class="flex flex-wrap items-center gap-3">
      <Button loading>Save changes</Button>
      <Button loading size="lg" variant="secondary">
        Add funds
      </Button>
      <Button loading variant="outline">
        Syncing
      </Button>
      <Button loading size="icon" aria-label="Upload">
        +
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const name of ["Save changes", "Add funds", "Syncing", "Upload"]) {
      const button = canvas.getByRole("button", { name });
      await expect(button).toBeDisabled();
    }
  },
};
