import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { IconMusicNote, IconPlay } from "@/components/media/icons";
import { StoryStack, StoryRow } from "@/stories/lib/story-layout";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "./item";

const artworkSrc =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="oklch(0.55 0.2 29)"/><circle cx="24" cy="24" r="10" fill="oklch(0.87 0.004 250)"/></svg>`,
  );

const meta = {
  title: "Components/Data Display/Item",
  component: Item,
  tags: ["autodocs"],
  args: {
    variant: "default",
    size: "default",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "muted"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "dense"],
    },
  },
  render: (args) => (
    <Item variant={args.variant} size={args.size}>
      <ItemMedia variant="icon">
        <IconMusicNote class="size-5 text-muted-foreground" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Song Title</ItemTitle>
        <ItemDescription>Artist name goes here</ItemDescription>
      </ItemContent>
    </Item>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Flexible row surface for lists: a leading `ItemMedia` (icon or image), `ItemContent` with `ItemTitle` and a clamped `ItemDescription`, and optional trailing `ItemActions`. Stack rows with `ItemGroup`. Purely presentational — wrap in a link or button when the row is clickable.",
      },
    },
  },
} satisfies Meta<typeof Item>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Song Title")).toBeVisible();
    await expect(canvas.getByText("Artist name goes here")).toBeVisible();
    await expect(
      canvas.getByText("Song Title").closest("div[class*='items-center']"),
    ).not.toBeNull();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack class="w-96">
      <ItemGroup>
        <Item variant="default">
          <ItemContent>
            <ItemTitle>Default</ItemTitle>
            <ItemDescription>No border, transparent background</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Outline</ItemTitle>
            <ItemDescription>Subtle border styling</ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Muted</ItemTitle>
            <ItemDescription>Quiet surface background</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
      <StoryRow>
        <ItemMedia variant="icon">
          <IconMusicNote class="size-5 text-muted-foreground" />
        </ItemMedia>
        <ItemMedia variant="image">
          <img alt="Album artwork" class="size-full object-cover" draggable={false} src={artworkSrc} />
        </ItemMedia>
      </StoryRow>
    </StoryStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <ItemGroup class="w-96">
      <Item size="dense">
        <ItemMedia variant="icon">
          <IconMusicNote class="size-5 text-muted-foreground" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Dense</ItemTitle>
        </ItemContent>
      </Item>
      <Item size="sm">
        <ItemMedia variant="icon">
          <IconMusicNote class="size-5 text-muted-foreground" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Small</ItemTitle>
        </ItemContent>
      </Item>
      <Item size="default">
        <ItemMedia variant="icon">
          <IconMusicNote class="size-5 text-muted-foreground" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Default</ItemTitle>
          <ItemDescription>With trailing actions</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button aria-label="Play" size="icon" variant="ghost">
            <IconPlay class="size-5" />
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Dense")).toBeVisible();
    await expect(canvas.getByText("Small")).toBeVisible();
    await expect(canvas.getByText("Default")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Play" })).toBeVisible();
  },
};
