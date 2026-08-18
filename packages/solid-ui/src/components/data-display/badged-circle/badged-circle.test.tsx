import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { BadgedCircle } from "./badged-circle";
import { IconCheck } from "@/components/media/icons";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("BadgedCircle", () => {
  it("renders the subject with an offset, padded badge frame", () => {
    const container = render(() => (
      <BadgedCircle
        badge={<span>badge</span>}
        badgeLabel="Verified"
        badgeSize={18}
      >
        <span>subject</span>
      </BadgedCircle>
    ));

    expect(within(container).getByText("subject")).toBeVisible();
    const badge = within(container).getByRole("img", { name: "Verified" });
    expect(badge).toBeVisible();
    expect(badge).toHaveAttribute("title", "Verified");
    expect(badge).toHaveStyle({ width: "20px", height: "20px", padding: "1px" });
  });

  it("applies custom offsets when provided", () => {
    const container = render(() => (
      <BadgedCircle badge={<span>badge</span>} badgeSize={16} badgeOffsetXPercent={8} badgeOffsetYPercent={20}>
        <span>subject</span>
      </BadgedCircle>
    ));

    const badge = container.querySelector("[class*='z-20']");
    expect(badge).toHaveStyle({ transform: "translate(8%, 20%)" });
  });

  it("keeps an unlabeled badge decorative", () => {
    const container = render(() => (
      <BadgedCircle badge={<span>badge</span>} badgeSize={16}>
        <span>subject</span>
      </BadgedCircle>
    ));

    expect(within(container).queryByRole("img")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => (
      <BadgedCircle
        badge={
          <span class="grid size-full place-items-center bg-success text-success-foreground">
            <IconCheck class="size-3" />
          </span>
        }
        badgeLabel="Verified"
        badgeSize={18}
      >
        <span class="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">P</span>
      </BadgedCircle>
    ));

    await expectNoA11yViolations();
  });
});
