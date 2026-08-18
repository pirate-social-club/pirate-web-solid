import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./skeleton";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Skeleton", () => {
  it("renders a placeholder with the pulse treatment", () => {
    const container = render(() => <Skeleton class="h-20 w-full" />);

    const skeleton = container.querySelector("div");
    expect(skeleton).toHaveClass("animate-pulse");
    expect(skeleton).toHaveClass("bg-surface-skeleton");
  });

  it("accepts layout classes", () => {
    const container = render(() => <Skeleton class="size-11 rounded-full" />);

    expect(container.querySelector("div")).toHaveClass("rounded-full");
  });

  it("has no axe violations", async () => {
    render(() => <Skeleton class="h-20 w-full" />);

    await expectNoA11yViolations();
  });
});
