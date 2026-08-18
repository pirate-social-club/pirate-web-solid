import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { buttonVariants } from "@/components/actions/button/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = {
  title: "Components/Overlays/DropdownMenu",
  component: DropdownMenu,
  tags: ["autodocs"],
  args: {
    gutter: 4,
    placement: "bottom-start",
  },
  argTypes: {
    placement: {
      control: "select",
      options: ["bottom-start", "bottom", "bottom-end"],
    },
    gutter: { control: "number" },
  },
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger class={buttonVariants({ variant: "outline" })}>
        Open menu
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-56">
        <DropdownMenuItem>View details</DropdownMenuItem>
        <DropdownMenuItem disabled>Archive</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel>Playback</DropdownMenuGroupLabel>
          <DropdownMenuCheckboxItem defaultChecked>Autoplay</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Crossfade</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuGroupLabel>Quality</DropdownMenuGroupLabel>
          <DropdownMenuRadioGroup defaultValue="high">
            <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="lossless">Lossless</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="text-destructive-text focus:text-destructive-text">
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Composable dropdown menu with compound parts. Use DropdownMenu with DropdownMenuTrigger and DropdownMenuContent, adding DropdownMenuItem, DropdownMenuGroup, DropdownMenuCheckboxItem, or DropdownMenuRadioGroup as needed. For a data-driven list of actions, prefer the ActionMenu pattern.",
      },
    },
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const highlightedItem = () =>
      body.getByRole("menu").querySelector("[data-highlighted]")?.textContent?.trim();

    const moveHighlightTo = async (name: string) => {
      for (let i = 0; i < 10 && highlightedItem() !== name; i++) {
        await userEvent.keyboard("{ArrowDown}");
      }
      await expect(highlightedItem()).toBe(name);
    };

    const trigger = canvas.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);

    const menu = await body.findByRole("menu");
    await expect(menu).toBeVisible();
    await waitFor(() => expect(menu).toHaveFocus());

    await moveHighlightTo("Autoplay");
    await expect(
      body.getByRole("menuitem", { name: "Archive" }),
    ).toHaveAttribute("data-disabled", "");

    await userEvent.click(body.getByRole("menuitemcheckbox", { name: "Autoplay" }));
    await waitFor(() =>
      expect(
        body.getByRole("menuitemcheckbox", { name: "Autoplay" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    await expect(body.getByRole("menu")).toBeVisible();

    await moveHighlightTo("Normal");
    await userEvent.click(body.getByRole("menuitemradio", { name: "Lossless" }));
    await waitFor(() =>
      expect(
        body.getByRole("menuitemradio", { name: "Lossless" }),
      ).toHaveAttribute("aria-checked", "true"),
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
