import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { MobilePageHeader } from "./mobile-page-header";

const meta = {
  title: "Patterns/Navigation/MobilePageHeader",
  component: MobilePageHeader,
  tags: ["autodocs"],
  args: { title: "Settings", onBackClick: fn() },
  argTypes: { backIcon: { table: { disable: true } }, closeIcon: { table: { disable: true } }, class: { table: { disable: true } }, trailingAction: { table: { disable: true } } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A compact page header with a leading navigation affordance, centered title, optional avatar/title action, and trailing slot. The header is fixed to the top of its containing block; the story decorator establishes one so autodocs renders each example in place instead of stacking them on the viewport.",
      },
    },
  },
  decorators: [
    (Story) => (
      // `transform` creates a containing block so the fixed header resolves
      // against this wrapper rather than the viewport (needed for autodocs).
      <div style={{ position: "relative", "min-height": "12rem", width: "100%", transform: "translateZ(0)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MobilePageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(args.onBackClick).toHaveBeenCalledTimes(1);
  },
};

export const CloseAndAction: Story = {
  args: { onBackClick: undefined, onCloseClick: fn(), trailingAction: <button type="button">Save</button> },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(args.onCloseClick).toHaveBeenCalledTimes(1);
  },
};

export const AvatarTitle: Story = {
  args: { title: "Atlas Gardens", titleAvatarFallback: "Atlas Gardens", titleAvatarSeed: "Atlas Gardens", onTitleClick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open Atlas Gardens" }));
    await expect(args.onTitleClick).toHaveBeenCalledTimes(1);
  },
};
