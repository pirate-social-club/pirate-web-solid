import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { ActionBanner } from "./action-banner";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("ActionBanner", () => {
  it("renders title, subtitle and action", () => {
    const container = render(() => (
      <ActionBanner
        action={<button type="button">Install</button>}
        subtitle="Add to your home screen."
        title="Install Pirate"
      />
    ));

    expect(within(container).getByText("Install Pirate")).toBeVisible();
    expect(within(container).getByText("Add to your home screen.")).toBeVisible();
    expect(within(container).getByRole("button", { name: "Install" })).toBeVisible();
  });

  it("renders copy without an action", () => {
    const container = render(() => (
      <ActionBanner subtitle="Purchases will appear here." title="No royalties" />
    ));

    expect(within(container).getByText("No royalties")).toBeVisible();
    expect(within(container).queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a subtitle-only banner", () => {
    const container = render(() => (
      <ActionBanner subtitle="Tap Share, then scroll down." />
    ));

    expect(within(container).getByText("Tap Share, then scroll down.")).toBeVisible();
  });

  it("forwards the id to the root", () => {
    const container = render(() => (
      <ActionBanner id="banner-1" title="Banner" />
    ));

    expect(container.querySelector("#banner-1")).not.toBeNull();
  });

  it("has no axe violations", async () => {
    render(() => (
      <ActionBanner
        action={<button type="button">Install</button>}
        subtitle="Add to your home screen."
        title="Install Pirate"
      />
    ));

    await expectNoA11yViolations();
  });
});
