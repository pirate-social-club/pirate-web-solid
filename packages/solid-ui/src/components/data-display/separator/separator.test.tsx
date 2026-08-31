import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Separator } from "./separator";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Separator", () => {
  it("renders a decorative horizontal divider hidden from assistive technology", () => {
    const container = render(() => <Separator />);

    const separator = container.querySelector("hr");
    expect(separator).toHaveAttribute("role", "none");
    expect(separator).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders a vertical orientation", () => {
    const container = render(() => <Separator orientation="vertical" />);

    const separator = container.querySelector("hr");
    expect(separator).toHaveAttribute("data-orientation", "vertical");
    expect(separator).not.toHaveAttribute("aria-orientation");
  });

  it("exposes separator semantics when decorative is false", () => {
    const container = render(() => <Separator decorative={false} orientation="vertical" />);

    expect(container.querySelector("hr")).not.toHaveAttribute("role", "none");
    expect(container.querySelector("hr")).toHaveAttribute("aria-orientation", "vertical");
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <p class="text-base">Above</p>
        <Separator class="my-3" />
        <p class="text-base">Below</p>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
