import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { PageContainer } from "./layout-shell";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("LayoutShell", () => {
  it("applies size and gutter classes on PageContainer", () => {
    const container = render(() => (
      <PageContainer size="feed" gutter>
        Content
      </PageContainer>
    ));

    const page = container.querySelector("div");
    expect(page).toHaveClass("max-w-[46rem]");
    expect(page).toHaveClass("px-[var(--page-gutter-x)]");
    expect(within(container).getByText("Content")).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <PageContainer gutter>
        <h2 class="text-xl font-semibold text-foreground">Page shell</h2>
      </PageContainer>
    ));

    await expectNoA11yViolations();
  });
});
