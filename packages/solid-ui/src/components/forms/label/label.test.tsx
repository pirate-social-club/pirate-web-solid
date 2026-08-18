import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/forms/input/input";
import { Label } from "./label";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Label", () => {
  it("renders a native label associated with its field", () => {
    const container = render(() => (
      <div>
        <Label for="display-name">Display name</Label>
        <Input id="display-name" />
      </div>
    ));

    const input = within(container).getByLabelText("Display name");
    expect(input.tagName).toBe("INPUT");
    expect(container.querySelector("label")).toHaveAttribute("for", "display-name");
  });

  it("applies the muted tone", () => {
    const container = render(() => <Label tone="muted">Optional</Label>);

    expect(within(container).getByText("Optional")).toHaveClass("text-muted-foreground");
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <Label for="display-name">Display name</Label>
        <Input id="display-name" />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
