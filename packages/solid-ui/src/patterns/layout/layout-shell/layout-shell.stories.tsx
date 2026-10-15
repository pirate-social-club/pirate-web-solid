import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { PageContainer } from "./layout-shell";

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
    // Fullscreen so the container is measured against the page, not a
    // shrink-to-fit centred wrapper.
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "PageContainer centres page content at a size class (feed 736px, narrow 896px, default 1024px, rail 1048px, wide 1280px) with optional page gutters of 16, 20 and 32px by breakpoint. Product routes compose it with their own chrome and surfaces.",
      },
    },
  },
} satisfies Meta<typeof PageContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A content surface drawn by the story, as on the Paper sheet. */
const surface = "rounded-[var(--radius-3xl)] border border-border-soft bg-card";

export const Default: Story = {
  args: {
    size: "default",
    gutter: true,
  },
  render: (args) => (
    <PageContainer {...args} class="py-6" data-testid="page">
      <div class={`${surface} p-6`}>
        <h2 class="text-xl font-semibold text-foreground">Page shell</h2>
        <p class="mt-2 text-base text-muted-foreground">
          Content sits inside the shell, centered by the page container.
        </p>
      </div>
    </PageContainer>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Page shell" })).toBeVisible();
    // The default container is 1024px at most; the surface fills it inside the gutters.
    const page = canvas.getByTestId("page").getBoundingClientRect();
    await expect(page.width).toBe(Math.min(1024, window.innerWidth));
  },
};

export const Sizes: Story = {
  render: () => (
    <div class="flex w-full flex-col gap-6 py-6">
      <PageContainer size="feed" data-testid="feed">
        <div class={`${surface} h-10`} />
      </PageContainer>
      <PageContainer size="narrow" data-testid="narrow">
        <div class={`${surface} h-10`} />
      </PageContainer>
      <PageContainer size="wide" data-testid="wide">
        <div class={`${surface} h-10`} />
      </PageContainer>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const width = (id: string) => canvas.getByTestId(id).getBoundingClientRect().width;
    await expect(width("feed")).toBe(Math.min(736, window.innerWidth));
    await expect(width("narrow")).toBe(Math.min(896, window.innerWidth));
    await expect(width("wide")).toBe(Math.min(1280, window.innerWidth));
  },
};
