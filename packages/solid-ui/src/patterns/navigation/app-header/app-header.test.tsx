import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  it("renders brand and default actions on the desktop branch", () => {
    const container = render(() => <AppHeader forceMobile={false} />);

    expect(within(container).getByRole("button", { name: "Go to home" })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Create" })).toBeVisible();
    expect(
      within(container).getByRole("button", { name: "Notifications" }),
    ).toBeVisible();
  });

  it("formats unread notification counts and caps at 99+", () => {
    const container = render(() => (
      <AppHeader forceMobile={false} unreadNotificationsCount={120} />
    ));

    const bell = within(container).getByRole("button", { name: "Notifications, 120" });
    expect(bell.querySelector(".notification-count-badge")).toHaveTextContent("99+");
  });

  it("renders the mobile branch with a menu affordance and fires callbacks", async () => {
    const user = userEvent.setup();
    let menuClicks = 0;
    const container = render(() => (
      <AppHeader forceMobile onMenuClick={() => (menuClicks += 1)} />
    ));

    await user.click(within(container).getByRole("button", { name: "Open navigation" }));
    expect(menuClicks).toBe(1);
  });

  it("prefers the back affordance when onBackClick is set on mobile", () => {
    const container = render(() => (
      <AppHeader forceMobile onBackClick={() => {}} onMenuClick={() => {}} />
    ));

    expect(within(container).getByRole("button", { name: "Go back" })).toBeVisible();
    expect(
      within(container).queryByRole("button", { name: "Open navigation" }),
    ).toBeNull();
  });

  it("shows the connect CTA instead of the profile action when logged out", () => {
    const container = render(() => (
      <AppHeader forceMobile={false} showConnectAction />
    ));

    expect(within(container).getByRole("button", { name: "Connect" })).toBeVisible();
    expect(
      within(container).queryByRole("button", { name: "Open profile" }),
    ).toBeNull();
  });

  it("has no automated a11y violations", async () => {
    render(() => <AppHeader forceMobile={false} />);

    await expectNoA11yViolations();
  });
});
