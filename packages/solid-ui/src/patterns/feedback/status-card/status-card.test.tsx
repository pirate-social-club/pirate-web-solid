import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { StatusCard } from "./status-card";

describe("StatusCard", () => {
  it("renders title, description, and actions", () => {
    const container = render(() => (
      <StatusCard
        title="Heads up"
        description="Verify your identity."
        tone="warning"
        actions={<button type="button">Verify</button>}
      />
    ));

    expect(within(container).getByText("Heads up")).toBeVisible();
    expect(within(container).getByText("Verify your identity.")).toBeVisible();
    expect(within(container).getByRole("button", { name: "Verify" })).toBeVisible();
  });

  it("has no automated a11y violations", async () => {
    render(() => <StatusCard title="All set" description="Done." tone="success" />);

    await expectNoA11yViolations();
  });
});
