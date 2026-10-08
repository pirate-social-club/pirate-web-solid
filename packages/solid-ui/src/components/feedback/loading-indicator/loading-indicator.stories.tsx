import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { LoadingIndicator } from "./loading-indicator";

const meta = {
  title: "Components/Feedback/Loading Indicator",
  component: LoadingIndicator,
  tags: ["autodocs"],
  args: { label: "Loading", variant: "section" },
  argTypes: {
    label: { control: "text" },
    variant: { control: "select", options: ["page", "section", "inline"] },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: { description: { component: "Spinner-only loading for pages, sections and inline content. The wrapper announces one localized status; its spinner is decorative. Animation respects reduced motion." } },
  },
} satisfies Meta<typeof LoadingIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Section: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status", { name: "Loading" })).toBeVisible();
    await expect(canvas.getAllByRole("status")).toHaveLength(1);
    await expect(canvasElement.textContent?.trim()).toBe("");
  },
};
export const Page: Story = { args: { variant: "page", label: "Loading community" }, parameters: { layout: "fullscreen" } };
export const Inline: Story = { args: { variant: "inline", label: "Loading profiles" } };
export const Localized: Story = { args: { label: "جارٍ التحميل" } };
