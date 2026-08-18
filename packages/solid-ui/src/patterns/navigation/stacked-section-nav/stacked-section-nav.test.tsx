import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { StackedSectionNav } from "./stacked-section-nav";

const sections = [
  {
    label: "Account",
    items: [
      { label: "Profile", active: true },
      { label: "Notifications", description: "Email and push" },
      { label: "Privacy" },
    ],
  },
  {
    label: "App",
    items: [{ label: "Appearance" }, { label: "Language" }],
  },
];

describe("StackedSectionNav", () => {
  it("renders section labels, items, and descriptions", () => {
    const container = render(() => <StackedSectionNav sections={sections} />);

    expect(within(container).getByText("Account")).toBeVisible();
    expect(within(container).getByText("Email and push")).toBeVisible();
    expect(
      within(container).getByRole("button", { name: /Profile/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("invokes onSelect for the activated item", async () => {
    const user = userEvent.setup();
    let selected = "";
    const container = render(() => (
      <StackedSectionNav
        sections={[
          {
            label: "Account",
            items: [
              { label: "Profile" },
              { label: "Privacy", onSelect: () => (selected = "privacy") },
            ],
          },
        ]}
      />
    ));

    await user.click(within(container).getByRole("button", { name: /Privacy/ }));
    expect(selected).toBe("privacy");
  });

  it("has no automated a11y violations", async () => {
    render(() => <StackedSectionNav sections={sections} />);

    await expectNoA11yViolations();
  });
});
