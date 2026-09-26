import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { MobileFooterNav } from "./mobile-footer-nav";

describe("MobileFooterNav", () => {
  it("renders the four destinations in SSR-friendly markup", () => {
    const container = render(() => <MobileFooterNav activeItem="profile" />);
    const buttons = within(container).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Home", "Your songs", "Wallet", "Profile"]);
    expect(within(container).getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("fires haptic feedback before an item callback", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const container = render(() => <MobileFooterNav onTapHaptic={() => order.push("haptic")} onHomeClick={() => order.push("home")} />);
    await user.click(within(container).getByRole("button", { name: "Home" }));
    expect(order).toEqual(["haptic", "home"]);
  });

  it("marks only the active destination and renders currentColor icons", () => {
    const container = render(() => <MobileFooterNav activeItem="songs" />);
    expect(within(container).getByRole("button", { name: "Your songs" })).toHaveClass("h-full", "w-full", "text-foreground");
    expect(within(container).getByRole("button", { name: "Home" })).toHaveClass("text-muted-foreground");
    expect(within(container).getByRole("button", { name: "Home" }).querySelector('svg[fill="currentColor"]')).toBeInTheDocument();
  });

  it("supports injected icon factories", () => {
    const container = render(() => <MobileFooterNav icons={{ home: () => <span data-testid="home-icon" /> }} />);
    expect(within(container).getByTestId("home-icon")).toBeInTheDocument();
  });

  it("renders the center create action between songs and wallet", async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    const container = render(() => <MobileFooterNav activeItem="songs" onCreateClick={create} />);
    const buttons = within(container).getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Home", "Your songs", "Create", "Wallet", "Profile"]);
    const createButton = within(container).getByRole("button", { name: "Create" });
    // The create control is an action, never the current page.
    expect(createButton).not.toHaveAttribute("aria-current");
    expect(within(container).getByRole("button", { name: "Your songs" })).toHaveAttribute("aria-current", "page");
    await user.click(createButton);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("has no automated a11y violations", async () => {
    render(() => <MobileFooterNav />);
    await expectNoA11yViolations();
    document.documentElement.classList.add("light");
    await expectNoA11yViolations();
    document.documentElement.classList.remove("light");
  });
});
