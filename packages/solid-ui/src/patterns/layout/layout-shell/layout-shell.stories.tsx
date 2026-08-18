import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { CardShell, PageContainer } from "./layout-shell";

const meta = {
  title: "Patterns/Layout/LayoutShell",
  component: PageContainer,
  tags: ["autodocs"],
  args: {
    size: "default",
    gutter: true,
  },
  argTypes: {
    size: {
      control: "select",
      options: ["default", "feed", "narrow", "rail", "wide"],
    },
    gutter: { control: "boolean" },
    class: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Page shell helpers for the app frame. PageContainer centers page content at a size class with optional gutter padding; CardShell is the large rounded surface that hosts page content. Product routes compose these with their own chrome.",
      },
    },
  },
} satisfies Meta<typeof PageContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: "default",
    gutter: true,
  },
  render: (args) => (
    <PageContainer {...args} class="py-6">
      <CardShell class="p-6">
        <h2 class="text-xl font-semibold text-foreground">Page shell</h2>
        <p class="mt-2 text-base text-muted-foreground">
          Content sits inside the shell, centered by the page container.
        </p>
      </CardShell>
    </PageContainer>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Page shell" })).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <div class="flex w-full flex-col gap-6">
      <PageContainer size="feed">
        <CardShell class="h-10" />
      </PageContainer>
      <PageContainer size="narrow">
        <CardShell class="h-10" />
      </PageContainer>
      <PageContainer size="wide">
        <CardShell class="h-10" />
      </PageContainer>
    </div>
  ),
};
