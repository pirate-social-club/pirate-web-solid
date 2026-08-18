import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { FormattedText } from "./formatted-text";

const mixedValue = [
  "## Community guidelines",
  "",
  "Be kind and respectful. **Assume good intent** and report posts that *break* the rules instead of engaging.",
  "",
  "> Moderation is shared: every community can add its own rules on top of the platform terms.",
  "",
  "- Read the pinned posts first",
  "- Report instead of engaging",
  "- [Full guidelines](https://example.test/guidelines)",
  "",
  "1. Open the community page",
  "2. Tap **More**",
  "3. Choose ~~Settings~~ **Guidelines**",
].join("\n");

const meta = {
  title: "Components/Data Display/FormattedText",
  component: FormattedText,
  tags: ["autodocs"],
  args: {
    dir: "auto",
    value: mixedValue,
  },
  argTypes: {
    value: { control: "text" },
    dir: {
      control: "select",
      options: ["auto", "ltr", "rtl"],
    },
    lang: { control: "text" },
  },
  render: (args) => (
    <FormattedText class="w-[480px] max-w-full" dir={args.dir} lang={args.lang} value={args.value} />
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Renders markdown-lite user content (headings, quotes, bulleted and numbered lists, bold, italic, strikethrough, and links) into semantic HTML. Markdown `#` maps to `h2`, so `h1` stays reserved for the page. Links open in a new tab with `rel=\"noreferrer\"`. Use for post and comment bodies; do not use for trusted app copy.",
      },
    },
  },
} satisfies Meta<typeof FormattedText>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { level: 2, name: /Community guidelines/ })).toBeVisible();
    await expect(canvas.getByText("Assume good intent")).toBeVisible();
    await expect(canvas.getByText("report posts that")).toBeVisible();
    await expect(canvas.getByText("break")).toBeVisible();

    const link = canvas.getByRole("link", { name: "Full guidelines" });
    await expect(link).toHaveAttribute("href", "https://example.test/guidelines");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");

    const list = canvas.getAllByRole("list");
    await expect(list.length).toBe(2);
    await expect(canvas.getByText("Read the pinned posts first")).toBeVisible();
    await expect(canvas.getByText("Choose")).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    value:
      "# eZo Festival 2026\n\nIntro line for the festival post.\n\n## Basic info\n\nDoors open at noon and the first act starts at 2pm. This is a long unbroken link that should wrap inside a narrow container: https://example.test/really/long/unbroken/path/that/should/not-expand-mobile-layout\n\n### Los Refrescos -- live\n\nDetails about the live session with **Session Victim**.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("heading", { level: 2, name: /eZo Festival 2026/ })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 3, name: "Basic info" })).toBeVisible();
    await expect(canvas.getByRole("heading", { level: 4, name: /Los Refrescos/ })).toBeVisible();
    await expect(canvas.getByText(/Session Victim/)).toBeVisible();
  },
};

export const RightToLeft: Story = {
  globals: {
    direction: "rtl",
    locale: "ar",
  },
  args: {
    value:
      "## مرحبا بالعالم\n\nهذا نص تجريبي يحتوي على **تنسيق** وقائمة:\n\n- العنصر الأول\n- العنصر الثاني\n\n> اقتباس قصير للتوضيح",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(canvas.getByRole("heading", { level: 2, name: "مرحبا بالعالم" })).toBeVisible();
    await expect(canvas.getByText("العنصر الأول")).toBeVisible();
  },
};
