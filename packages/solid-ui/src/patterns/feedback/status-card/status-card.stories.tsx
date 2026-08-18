import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "@/components/actions/button/button";

import { StatusCard } from "./status-card";

const meta = {
  title: "Patterns/Feedback/StatusCard",
  component: StatusCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Inline status summary with default, success, and warning tones plus an action row; flatOnMobile drops the card chrome on small viewports.",
      },
    },
  },
  args: {
    title: "Welcome aboard",
    description: "This is a default status card with no special tone.",
  },
} satisfies Meta<typeof StatusCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Success: Story = {
  args: {
    title: "All set",
    description: "Your community has been created successfully.",
    tone: "success",
  },
};

export const Warning: Story = {
  args: {
    title: "Heads up",
    description: "You need to verify your identity before posting.",
    tone: "warning",
    actions: <Button size="sm">Verify</Button>,
  },
};

export const FlatOnMobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    title: "Mobile flat variant",
    description: "This card loses its rounded border and background on small viewports.",
    flatOnMobile: true,
    tone: "warning",
  },
};
