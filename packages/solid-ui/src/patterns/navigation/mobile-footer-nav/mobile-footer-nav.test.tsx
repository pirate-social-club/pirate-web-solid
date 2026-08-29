import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { MobileFooterNav } from "./mobile-footer-nav";

describe("MobileFooterNav", () => {
  it("renders the four pen destinations in SSR-friendly markup", () => {
    const container = render(() => <MobileFooterNav activeItem="profile" />);
    const buttons = within(container).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Home", "Learn", "Wallet", "Profile"]);
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
    const container = render(() => <MobileFooterNav activeItem="learn" />);
    expect(within(container).getByRole("button", { name: "Learn" })).toHaveClass("h-full", "w-full", "text-foreground");
    expect(within(container).getByRole("button", { name: "Home" })).toHaveClass("text-muted-foreground");
    expect(within(container).getByRole("button", { name: "Home" }).querySelector('svg[fill="currentColor"]')).toBeInTheDocument();
  });

  it("supports injected icon factories", () => {
    const container = render(() => <MobileFooterNav icons={{ home: () => <span data-testid="home-icon" /> }} />);
    expect(within(container).getByTestId("home-icon")).toBeInTheDocument();
  });

  it("has no automated a11y violations", async () => {
    render(() => <MobileFooterNav />);
    await expectNoA11yViolations();
    document.documentElement.classList.add("light");
    await expectNoA11yViolations();
    document.documentElement.classList.remove("light");
  });
});
