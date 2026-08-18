import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { CardShell, PageContainer } from "./layout-shell";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("LayoutShell", () => {
  it("applies size and gutter classes on PageContainer", () => {
    const container = render(() => (
      <PageContainer size="feed" gutter>
        <CardShell>Content</CardShell>
      </PageContainer>
    ));

    const page = container.querySelector("div");
    expect(page).toHaveClass("max-w-[46rem]");
    expect(page).toHaveClass("px-[var(--page-gutter-x)]");
  });

  it("renders the card shell surface", () => {
    const container = render(() => <CardShell>Content</CardShell>);

    expect(container.querySelector("div")).toHaveClass("rounded-[var(--radius-3xl)]");
    expect(within(container).getByText("Content")).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => (
      <PageContainer gutter>
        <CardShell class="p-6">
          <h2 class="text-xl font-semibold text-foreground">Page shell</h2>
        </CardShell>
      </PageContainer>
    ));

    await expectNoA11yViolations();
  });
});
