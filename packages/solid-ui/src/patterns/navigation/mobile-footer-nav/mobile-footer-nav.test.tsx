import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { MobileFooterNav } from "./mobile-footer-nav";

describe("MobileFooterNav", () => {
  it("renders all five destinations in SSR-friendly markup", () => {
    const container = render(() => <MobileFooterNav activeItem="profile" />);
    expect(within(container).getAllByRole("button")).toHaveLength(5);
    expect(within(container).getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("fires haptic feedback before an item callback", async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const container = render(() => <MobileFooterNav onTapHaptic={() => order.push("haptic")} onHomeClick={() => order.push("home")} />);
    await user.click(within(container).getByRole("button", { name: "Home" }));
    expect(order).toEqual(["haptic", "home"]);
  });

  it("normalizes and exposes unread counts accessibly", () => {
    const container = render(() => <MobileFooterNav unreadChatCount={4.9} unreadInboxCount={128} />);
    expect(within(container).getByRole("button", { name: "Chat, 4" })).toBeInTheDocument();
    expect(within(container).getByRole("button", { name: "Inbox, 128" })).toBeInTheDocument();
    expect(within(container).getByText("99+")).toHaveClass("notification-count-badge");
    expect(within(container).getByRole("button", { name: "Home" })).toHaveClass("h-full", "w-full", "text-foreground");
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
