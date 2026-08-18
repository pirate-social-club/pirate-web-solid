import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { ActionMenu, type ActionMenuItem } from "./action-menu";

const items: ActionMenuItem[] = [
  { key: "view", label: "View details" },
  { key: "edit", label: "Edit" },
  { key: "share", label: "Share", separatorBefore: true },
  { key: "delete", label: "Delete", destructive: true, separatorBefore: true },
  { key: "archive", label: "Archive", disabled: true },
];

const meta = {
  title: "Patterns/Overlays/ActionMenu",
  component: ActionMenu,
  tags: ["autodocs"],
  args: {
    label: "Open menu",
    items,
    onAction: fn(),
    onCheckedChange: fn(),
  },
  argTypes: {
    triggerVariant: {
      control: "select",
      options: ["default", "outline", "secondary", "ghost", "destructive"],
    },
    placement: {
      control: "select",
      options: ["bottom-start", "bottom-end", "top-start", "top-end"],
    },
    items: { table: { disable: true } },
    groups: { table: { disable: true } },
    onAction: { table: { disable: true } },
    onCheckedChange: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Data-driven action list built on the DropdownMenu parts. Pass typed items with destructive, disabled, separator, and optional checked state; receive selections through onAction and onCheckedChange. Use the base DropdownMenu when the content needs arbitrary composition.",
      },
    },
  },
} satisfies Meta<typeof ActionMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open menu" }));
    const menu = await body.findByRole("menu");
    await expect(menu).toBeVisible();

    const disabledItem = body.getByRole("menuitem", { name: "Archive" });
    await expect(disabledItem).toHaveAttribute("data-disabled", "");

    await userEvent.click(body.getByRole("menuitem", { name: "Edit" }));
    await expect(args.onAction).toHaveBeenCalledWith("edit");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );
  },
};

export const Variants: Story = {
  render: (args) => (
    <StoryStack>
      <StoryRow>
        <ActionMenu {...args} label="Default" triggerVariant="default" />
        <ActionMenu {...args} label="Secondary" triggerVariant="secondary" />
        <ActionMenu {...args} label="Ghost" triggerVariant="ghost" />
        <ActionMenu {...args} label="Destructive" triggerVariant="destructive" />
      </StoryRow>
      <StoryRow>
        <ActionMenu
          {...args}
          label="Playback options"
          groups={[
            {
              label: "Library",
              items: [
                { key: "add", label: "Add to playlist" },
                { key: "download", label: "Download" },
              ],
            },
            {
              label: "Playback",
              items: [
                { key: "shuffle", label: "Shuffle", checked: true },
                { key: "repeat", label: "Repeat", checked: false },
              ],
            },
          ]}
        />
      </StoryRow>
    </StoryStack>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Playback options" }),
    );
    await expect(await body.findByRole("menu")).toBeVisible();

    const shuffle = body.getByRole("menuitemcheckbox", { name: "Shuffle" });
    await expect(shuffle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(shuffle);
    await expect(args.onCheckedChange).toHaveBeenCalledWith("shuffle", false);
    await expect(body.getByRole("menu")).toBeVisible();
  },
};
