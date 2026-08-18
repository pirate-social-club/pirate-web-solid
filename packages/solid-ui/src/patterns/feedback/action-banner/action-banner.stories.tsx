import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { ActionBanner } from "./action-banner";

const meta = {
  title: "Patterns/Feedback/ActionBanner",
  component: ActionBanner,
  tags: ["autodocs"],
  args: {
    title: "Install Pirate",
    subtitle: "Add to your home screen for the best experience.",
  },
  argTypes: {
    title: { control: "text" },
    subtitle: { control: "text" },
    action: { table: { disable: true } },
  },
  render: (args) => (
    <ActionBanner
      class="w-[480px] max-w-full"
      action={<Button size="sm">Install</Button>}
      subtitle={args.subtitle}
      title={args.title}
    />
  ),
  parameters: {
    docs: {
      description: {
        component:
          "One-line call to action pairing copy with a single trailing action. Use it inside cards and detail views; do not use it as a toolbar or as a substitute for a form layout.",
      },
    },
  },
} satisfies Meta<typeof ActionBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Install Pirate")).toBeVisible();
    await expect(
      canvas.getByText("Add to your home screen for the best experience."),
    ).toBeVisible();

    const action = canvas.getByRole("button", { name: "Install" });
    await userEvent.tab();
    await expect(action).toHaveFocus();
  },
};

export const WithoutAction: Story = {
  render: () => (
    <ActionBanner
      class="w-[480px] max-w-full"
      subtitle="Purchases will appear here."
      title="No royalties to claim"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("No royalties to claim")).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};

export const LongContent: Story = {
  render: () => (
    <ActionBanner
      class="w-80"
      action={<Button size="sm">Back</Button>}
      subtitle='Tap the Share button below, then scroll down and tap "Add to Home Screen".'
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(/Tap the Share button below/),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeVisible();
  },
};

export const RightToLeft: Story = {
  globals: {
    direction: "rtl",
    locale: "ar",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(canvas.getByText("Install Pirate")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Install" })).toBeVisible();
  },
};
