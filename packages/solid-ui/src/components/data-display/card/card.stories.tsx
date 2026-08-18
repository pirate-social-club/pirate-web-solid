import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryRow } from "@/stories/lib/story-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

interface CardStoryArgs {
  title: string;
  description: string;
}

const meta = {
  title: "Components/Data Display/Card",
  component: Card,
  tags: ["autodocs"],
  args: {
    title: "Community",
    description: "A place for your people to listen and talk together.",
  } satisfies CardStoryArgs,
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
  },
  render: (args) => (
    <Card class="w-96">
      <CardHeader>
        <CardTitle>{args.title}</CardTitle>
        <CardDescription>{args.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p class="text-base text-foreground">
          Members, posts, and shared playlists live here.
        </p>
      </CardContent>
      <CardFooter>
        <span class="text-base text-muted-foreground">
          Updated 2 minutes ago
        </span>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Grouped content surface with compound parts. Compose Card with CardHeader, CardTitle, CardDescription, CardContent, and CardFooter. Use it for self-contained units of information; do not nest Cards inside Cards.",
      },
    },
  },
} satisfies Meta<CardStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByRole("heading", { name: "Community" });
    await expect(title).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow class="items-start">
      <Card class="w-72 p-4">
        <CardTitle>Compact card</CardTitle>
      </Card>
      <Card class="w-96">
        <CardHeader>
          <CardTitle>Header only</CardTitle>
          <CardDescription>No content or footer parts.</CardDescription>
        </CardHeader>
      </Card>
    </StoryRow>
  ),
};
