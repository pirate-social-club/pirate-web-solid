import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Spinner } from "./spinner";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Spinner", () => {
  it("exposes role status with the default loading name", () => {
    const container = render(() => <Spinner />);

    const spinner = within(container).getByRole("status", { name: "Loading" });
    expect(spinner.tagName).toBe("svg");
  });

  it("accepts a localized label", () => {
    const container = render(() => <Spinner label="جارٍ التحميل" />);

    expect(
      within(container).getByRole("status", { name: "جارٍ التحميل" }),
    ).toBeInTheDocument();
  });

  it("applies size variants", () => {
    const container = render(() => <Spinner size="lg" />);

    expect(within(container).getByRole("status")).toHaveClass("size-8");
  });

  it("has no axe violations", async () => {
    render(() => <Spinner />);

    await expectNoA11yViolations();
  });
});
