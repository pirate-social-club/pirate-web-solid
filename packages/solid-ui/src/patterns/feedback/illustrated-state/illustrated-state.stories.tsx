import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { IllustratedState } from "./illustrated-state";

const ghostSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="oklch(0.22 0 0)"/><path d="M128 56c-30 0-54 24-54 54v92l18-14 18 14 18-14 18 14 18-14 18 14v-92c0-30-24-54-54-54z" fill="oklch(0.65 0.01 250)"/><circle cx="104" cy="108" r="8" fill="oklch(0.22 0 0)"/><circle cx="152" cy="108" r="8" fill="oklch(0.22 0 0)"/></svg>`,
);
const errorGhost = {
  alt: "Confused pirate ghost",
  src: `data:image/svg+xml;charset=utf-8,${ghostSvg}`,
  srcSet: `data:image/svg+xml;charset=utf-8,${ghostSvg} 1x`,
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
