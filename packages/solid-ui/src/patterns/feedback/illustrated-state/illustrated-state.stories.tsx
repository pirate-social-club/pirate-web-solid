import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { IllustratedState } from "./illustrated-state";

const errorGhost = {
  alt: "Confused pirate ghost",
  src: "/mascots/error-ghost-256.png",
  srcSet: "/mascots/error-ghost-512.webp 2x, /mascots/error-ghost-256.webp 1x",
};

const meta = {
  title: "Patterns/Feedback/IllustratedState",
  component: IllustratedState,
  tags: ["autodocs"],
  args: {
    description: "Something went wrong while loading this view.",
    image: errorGhost,
    title: "Could not load",
  },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    action: { table: { disable: true } },
    image: { table: { disable: true } },
  },
  render: (args) => (
    <IllustratedState
      description={args.description}
      image={args.image}
      title={args.title}
    />
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Centered full-view placeholder for empty, error, and success states: circular mascot image, muted title, optional description, and one optional recovery action. The image is a `picture` with a webp source and a fallback `img`, both required. Use it for whole views, not inline messages.",
      },
    },
  },
} satisfies Meta<typeof IllustratedState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("img", { name: "Confused pirate ghost" })).toBeVisible();
    await expect(canvas.getByText("Could not load")).toBeVisible();
    await expect(
      canvas.getByText("Something went wrong while loading this view."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};

export const WithAction: Story = {
  render: () => (
    <IllustratedState
      action={<Button size="sm">Try again</Button>}
      description="Refresh the request and try again."
      image={errorGhost}
      title="Request failed"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const action = canvas.getByRole("button", { name: "Try again" });
    await expect(action).toBeVisible();
    action.focus();
    await expect(action).toHaveFocus();
  },
};

export const LongContent: Story = {
  render: () => (
    <IllustratedState
      description="No one has posted here yet. Be the first to start the conversation and share something with the community. Early posts tend to get the most replies."
      image={errorGhost}
      title="Nothing here yet"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Nothing here yet")).toBeVisible();
    await expect(canvas.getByText(/No one has posted here yet/)).toBeVisible();
  },
};
