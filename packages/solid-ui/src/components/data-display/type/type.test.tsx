import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Type } from "./type";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Type", () => {
  it("renders a span with the body recipe by default", () => {
    const container = render(() => <Type>Hello</Type>);

    const el = within(container).getByText("Hello");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("text-base");
  });

  it("renders the requested element through the as prop", () => {
    const container = render(() => (
      <Type as="h2" variant="h2">
        Heading
      </Type>
    ));

    const el = within(container).getByRole("heading", { level: 2 });
    expect(el).toHaveTextContent("Heading");
  });

  it("applies the requested variant recipe", () => {
    const container = render(() => <Type variant="overline">Eyebrow</Type>);

    expect(within(container).getByText("Eyebrow")).toHaveClass("uppercase");
  });

  it("applies a typed line-height override", () => {
    const container = render(() => (
      <Type leading="roomy" variant="body">
        Roomy body copy
      </Type>
    ));

    expect(within(container).getByText("Roomy body copy")).toHaveClass(
      "leading-8",
    );
  });

  it("applies a typed desktop heading size override", () => {
    const container = render(() => (
      <Type responsiveSize="desktop4xl" variant="h1">
        Responsive heading
      </Type>
    ));

    expect(within(container).getByText("Responsive heading")).toHaveClass(
      "md:text-4xl",
    );
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <Type as="h1" variant="h1">
          Page title
        </Type>
        <Type as="p" variant="body">
          Body copy.
        </Type>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
