import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryStack } from "@/stories/lib/story-layout";
import { MediaUploadField } from "./media-upload-field";

const artwork =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#3b2f4a"/><circle cx="30" cy="20" r="12" fill="#d8434b"/></svg>`,
  );

const meta = {
  title: "Patterns/Forms/MediaUploadField",
  component: MediaUploadField,
  tags: ["autodocs"],
  args: { label: "Cover image", chooseLabel: "Add cover", replaceLabel: "Replace cover" },
  render: (args) => (
    <StoryStack class="w-96">
      <MediaUploadField {...args} />
    </StoryStack>
  ),
} satisfies Meta<typeof MediaUploadField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Banner: Story = {
  args: { hideLabel: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("Cover image")).toBeInTheDocument();
  },
};

export const BannerWithPreview: Story = {
  args: { hideLabel: true, previewSrc: artwork, onClear: () => undefined },
};

export const Square: Story = {
  args: { frame: "square", description: "Square artwork works best." },
};

export const Circle: Story = {
  args: {
    frame: "circle",
    label: "Community avatar",
    chooseLabel: "Choose image",
    replaceLabel: "Replace image",
    fallbackLabel: "SR",
  },
};

export const CircleWithPreview: Story = {
  args: {
    frame: "circle",
    label: "Community avatar",
    chooseLabel: "Choose image",
    replaceLabel: "Replace image",
    previewSrc: artwork,
    onClear: () => undefined,
  },
};
