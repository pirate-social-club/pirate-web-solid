import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { IconMusicNote, IconPlay } from "@/components/media/icons";
import { demoArtworkImage } from "@/stories/lib/fixtures";
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

const artworkSrc = demoArtworkImage;

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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The image tile loads a real fixture rather than a broken-image glyph.
    const artwork = canvas.getByRole("img", { name: "Album artwork" }) as HTMLImageElement;
    await waitFor(() => expect(artwork.complete && artwork.naturalWidth > 0).toBe(true));
  },
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

/** An image tile whose source fails falls back to Paper's plain skeleton square. */
export const ImageFallback: Story = {
  name: "Image fallback",
  render: () => (
    <ItemMedia data-testid="image-tile" variant="image">
      <img alt="Album artwork" class="size-full object-cover" draggable={false} src="/missing-artwork.png" />
    </ItemMedia>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = canvas.getByTestId("image-tile");
    const image = tile.querySelector("img") as HTMLImageElement;
    // No broken-image glyph or alt text: the failed image leaves the layout.
    await waitFor(() => expect(image.hidden).toBe(true));
    await expect(image.getBoundingClientRect().width).toBe(0);
    // The 48px tile keeps its skeleton surface and 4px corner.
    const box = tile.getBoundingClientRect();
    await expect([box.width, box.height]).toEqual([48, 48]);
    const style = getComputedStyle(tile);
    await expect(style.borderTopLeftRadius).toBe("4px");
    await expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  },
};
