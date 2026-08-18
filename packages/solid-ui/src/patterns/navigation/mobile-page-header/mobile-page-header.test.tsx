import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { MobilePageHeader } from "./mobile-page-header";

describe("MobilePageHeader", () => {
  it("renders a centered title and back callback", async () => {
    const user = userEvent.setup();
    const onBackClick = vi.fn();
    const container = render(() => <MobilePageHeader onBackClick={onBackClick} title="Settings" />);
    expect(within(container).getByText("Settings")).toBeInTheDocument();
    expect(within(container).getByRole("banner")).toHaveClass("fixed");
    await user.click(within(container).getByRole("button", { name: "Back" }));
    expect(onBackClick).toHaveBeenCalledTimes(1);
  });

  it("prefers close over back and supports a tappable title", async () => {
    const user = userEvent.setup();
    const onCloseClick = vi.fn();
    const onTitleClick = vi.fn();
    const container = render(() => (
      <MobilePageHeader onBackClick={vi.fn()} onCloseClick={onCloseClick} onTitleClick={onTitleClick} title="Atlas" titleActionAriaLabel="Open community" />
    ));
    await user.click(within(container).getByRole("button", { name: "Close" }));
    await user.click(within(container).getByRole("button", { name: "Open community" }));
    expect(onCloseClick).toHaveBeenCalledTimes(1);
    expect(onTitleClick).toHaveBeenCalledTimes(1);
  });

  it("renders the trailing action, custom icons, and overridable labels", async () => {
    const user = userEvent.setup();
    const onCloseClick = vi.fn();
    const container = render(() => (
      <MobilePageHeader
        closeAriaLabel="Dismiss"
        closeIcon={<svg data-testid="custom-close" />}
        onCloseClick={onCloseClick}
        title="Settings"
        trailingAction={<button type="button">Save</button>}
      />
    ));

    expect(within(container).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(container.querySelector("[data-testid='custom-close']")).not.toBeNull();
    expect(within(container).queryByRole("button", { name: "Close" })).toBeNull();
    await user.click(within(container).getByRole("button", { name: "Dismiss" }));
    expect(onCloseClick).toHaveBeenCalledTimes(1);
  });

  it("renders an avatar beside the title when supplied", () => {
    const container = render(() => (
      <MobilePageHeader title="Atlas Gardens" titleAvatarFallback="Atlas Gardens" titleAvatarSeed="Atlas Gardens" />
    ));
    expect(within(container).getByText("Atlas Gardens")).toBeInTheDocument();
    expect(within(container).getByRole("img", { name: "Atlas Gardens" })).toBeInTheDocument();
  });

  it("renders an empty leading slot when neither back nor close is supplied", () => {
    const container = render(() => <MobilePageHeader title="Settings" />);
    expect(within(container).queryAllByRole("button")).toHaveLength(0);
  });

  it("has no axe violations", async () => {
    render(() => <MobilePageHeader title="Settings" />);
    try {
      await expectNoA11yViolations();
      document.documentElement.classList.add("light");
      await expectNoA11yViolations();
    } finally {
      document.documentElement.classList.remove("light");
    }
  });
});
