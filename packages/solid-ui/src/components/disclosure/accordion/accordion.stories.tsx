import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";

interface AccordionStoryArgs {
  collapsible: boolean;
  defaultValue: string[];
  multiple: boolean;
}

const meta = {
  title: "Components/Disclosure/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  args: {
    collapsible: false,
    defaultValue: ["item-1"],
    multiple: false,
  } satisfies AccordionStoryArgs,
  argTypes: {
    defaultValue: { control: "object" },
    multiple: { control: "boolean" },
    collapsible: { control: "boolean" },
    value: { table: { disable: true } },
    onChange: { table: { disable: true } },
    shouldFocusWrap: { control: "boolean" },
  },
  render: (args) => (
    <div class="w-[calc(100vw-2rem)] max-w-full p-4">
      <Accordion
        class="w-full max-w-[480px]"
        collapsible={args.collapsible}
        defaultValue={args.defaultValue}
        multiple={args.multiple}
      >
      <AccordionItem value="item-1">
        <AccordionHeader>
          <AccordionTrigger>What is Pirate?</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          Pirate is a community-first social product for discovering communities,
          posts, and shared resources.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionHeader>
          <AccordionTrigger>How do communities work?</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          Communities organize people around a topic or identity, making
          discovery and participation easier than flat feeds.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionHeader>
          <AccordionTrigger>Can I start my own community?</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          Yes. Starting a community creates a new space for posts, members, and
          shared resources around your focus.
        </AccordionContent>
      </AccordionItem>
      </Accordion>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Vertically stacked disclosure sections built on the Kobalte Accordion. Compose `Accordion` with `AccordionItem` (value per item), `AccordionHeader` (pass `as` to set the heading level), `AccordionTrigger`, and `AccordionContent`. Keyboard: Enter/Space toggles the focused section, arrow keys and Home/End move between triggers. Closed content is unmounted, so no focusable elements remain hidden inside collapsed sections.",
      },
    },
  },
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
};

export const Interaction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole("button", { name: "What is Pirate?" });
    const second = canvas.getByRole("button", {
      name: "How do communities work?",
    });
    const third = canvas.getByRole("button", {
      name: "Can I start my own community?",
    });

    await userEvent.click(second);
    await expect(second).toHaveAttribute("aria-expanded", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.getByText(/organize people around a topic/)).toBeVisible();
    await userEvent.keyboard("{Home}");
    await expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(third).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    await expect(second).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(second).toHaveAttribute("aria-expanded", "true");
  },
};

export const Multiple: Story = {
  args: {
    defaultValue: ["item-1", "item-2"],
    multiple: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole("button", { name: "What is Pirate?" });
    const second = canvas.getByRole("button", {
      name: "How do communities work?",
    });

    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(second).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(first);
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await expect(second).toHaveAttribute("aria-expanded", "true");
  },
};

export const Disabled: Story = {
  render: () => (
    <Accordion class="w-[480px] max-w-full" defaultValue={["item-2"]}>
      <AccordionItem value="item-1" disabled>
        <AccordionHeader>
          <AccordionTrigger>Locked section</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          This section is disabled and cannot be expanded.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionHeader>
          <AccordionTrigger>Open section</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          This section is open by default.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const locked = canvas.getByRole("button", { name: "Locked section" });

    await expect(locked).toBeDisabled();
    await expect(locked).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(locked);
    await expect(locked).toHaveAttribute("aria-expanded", "false");
  },
};

export const LongContent: Story = {
  render: () => (
    <Accordion class="w-[480px] max-w-full" defaultValue={["item-1"]}>
      <AccordionItem value="item-1">
        <AccordionHeader>
          <AccordionTrigger>Community guidelines</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          Be kind and respectful to others. Treat every member with decency and
          assume good intent. Do not post spam, harassment, or content that
          violates the law. Communities may add their own rules on top of these
          guidelines, but nothing in a community can override the platform
          terms. When you see a post that breaks a rule, report it instead of
          engaging. Moderators review reports in order and may remove content
          that harms the community.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionHeader>
          <AccordionTrigger>Moderation and reports</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>
          Reports are visible only to moderators and the people who filed them.
          A removed post can be appealed by its author. Repeated violations can
          lead to posting limits or account suspension.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const RightToLeft: Story = {
  globals: {
    direction: "rtl",
    locale: "ar",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    const first = canvas.getByRole("button", { name: "What is Pirate?" });
    await expect(first).toHaveAttribute("aria-expanded", "true");
    first.focus();
    await userEvent.keyboard("{End}");
    await expect(
      canvas.getByRole("button", { name: "Can I start my own community?" }),
    ).toHaveFocus();
  },
};
