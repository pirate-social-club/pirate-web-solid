import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Button", () => {
  it("renders children with a button role and button type by default", () => {
    render(() => <Button>Continue</Button>);

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("forwards native attributes", () => {
    render(() => (
      <Button aria-label="Save" data-testid="save" type="submit">
        Save
      </Button>
    ));

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("data-testid", "save");
  });

  it("disables the button while loading and keeps the visible name", () => {
    render(() => <Button loading>Save changes</Button>);

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toBeDisabled();
  });

  it("keeps loading dominant over an explicit disabled={false}", () => {
    render(() => (
      <Button loading disabled={false}>
        Save changes
      </Button>
    ));

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toBeDisabled();
  });

  it("exposes a busy hint for assistive technology while loading", () => {
    render(() => <Button loading>Save changes</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });

  it("supports keyboard activation and receives focus", async () => {
    const user = userEvent.setup();
    const container = render(() => <Button>Continue</Button>);

    const button = within(container).getByRole("button", { name: "Continue" });
    await user.click(button);
    expect(button).toHaveFocus();
  });

  it("composes consumer refs onto the rendered button element", () => {
    let captured: HTMLElement | undefined;
    const container = render(() => (
      <Button ref={(el) => (captured = el)}>Continue</Button>
    ));

    const button = within(container).getByRole("button", { name: "Continue" });
    expect(captured).toBe(button);
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <Button>Continue</Button>
        <Button variant="outline">Cancel</Button>
        <Button loading>Save changes</Button>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
