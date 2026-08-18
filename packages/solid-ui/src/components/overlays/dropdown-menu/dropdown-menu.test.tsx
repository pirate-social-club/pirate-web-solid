import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

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
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderMenu() {
  return render(() => (
    <DropdownMenu gutter={4} placement="bottom-start">
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
      </DropdownMenuContent>
    </DropdownMenu>
  ));
}

function highlightedItem(): string | null {
  const highlighted = screen.getByRole("menu").querySelector("[data-highlighted]");
  return highlighted?.textContent?.trim() ?? null;
}

async function moveHighlightTo(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  for (let i = 0; i < 10 && highlightedItem() !== name; i++) {
    await user.keyboard("{ArrowDown}");
  }
  expect(highlightedItem()).toBe(name);
}

async function openMenu(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(container).getByRole("button", { name: "Open menu" }));
  await screen.findByRole("menu");
}

describe("DropdownMenu", () => {
  it("opens from the trigger and exposes the menu role", async () => {
    const user = userEvent.setup();
    const container = renderMenu();

    await user.click(within(container).getByRole("button", { name: "Open menu" }));

    const menu = await screen.findByRole("menu");
    expect(menu).toBeVisible();
  });

  it("skips disabled items in keyboard navigation", async () => {
    const user = userEvent.setup();
    const container = renderMenu();

    await openMenu(container, user);

    await moveHighlightTo(user, "Autoplay");

    const archive = screen.getByRole("menuitem", { name: "Archive" });
    expect(archive).toHaveAttribute("data-disabled", "");
    expect(archive).not.toHaveAttribute("tabindex");
  });

  it("toggles checkbox items without closing the menu", async () => {
    const user = userEvent.setup();
    const container = renderMenu();

    await openMenu(container, user);

    await moveHighlightTo(user, "Autoplay");

    const autoplay = screen.getByRole("menuitemcheckbox", { name: "Autoplay" });
    expect(autoplay).toHaveAttribute("aria-checked", "true");

    await user.click(autoplay);
    await vi.waitFor(() =>
      expect(
        screen.getByRole("menuitemcheckbox", { name: "Autoplay" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(screen.getByRole("menu")).toBeVisible();
  });

  it("selects radio items and keeps the menu open until Escape", async () => {
    const user = userEvent.setup();
    const container = renderMenu();

    await openMenu(container, user);

    await moveHighlightTo(user, "Normal");

    await user.click(screen.getByRole("menuitemradio", { name: "Lossless" }));

    await vi.waitFor(() =>
      expect(
        screen.getByRole("menuitemradio", { name: "Lossless" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByRole("menu")).toBeVisible();

    await user.keyboard("{Escape}");
    await vi.waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
    await vi.waitFor(() =>
      expect(
        within(container).getByRole("button", { name: "Open menu" }),
      ).toHaveFocus(),
    );
  });

  it("has no axe violations while open", async () => {
    const user = userEvent.setup();
    const container = renderMenu();

    await openMenu(container, user);

    await expectNoA11yViolations();
  });
});
