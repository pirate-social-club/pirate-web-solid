import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { StackPageShell } from "./stack-page-shell";

describe("StackPageShell", () => {
  it("renders the card header with title, description, and actions", () => {
    const container = render(() => (
      <StackPageShell
        title="Settings"
        description="Manage your account."
        actions={<button type="button">Save</button>}
      >
        <div>Body</div>
      </StackPageShell>
    ));

    expect(within(container).getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(within(container).getByText("Manage your account.")).toBeVisible();
    expect(within(container).getByRole("button", { name: "Save" })).toBeVisible();
    expect(within(container).getByText("Body")).toBeVisible();
  });

  it("omits the header when there is nothing to show", () => {
    const container = render(() => (
      <StackPageShell title="  ">
        <div>Body</div>
      </StackPageShell>
    ));

    expect(within(container).queryByRole("heading")).toBeNull();
    expect(within(container).getByText("Body")).toBeVisible();
  });

  it("has no automated a11y violations", async () => {
    render(() => (
      <StackPageShell title="Settings">
        <div>Body</div>
      </StackPageShell>
    ));

    await expectNoA11yViolations();
  });
});
