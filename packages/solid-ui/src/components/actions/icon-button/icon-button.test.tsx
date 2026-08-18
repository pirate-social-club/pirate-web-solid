import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { IconX } from "@/components/media/icons";
import { IconButton } from "./icon-button";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("IconButton", () => {
  it("renders an icon-only button with the provided accessible name", () => {
    const container = render(() => (
      <IconButton aria-label="Close dialog">
        <IconX class="size-5" />
      </IconButton>
    ));

    const button = within(container).getByRole("button", { name: "Close dialog" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("supports keyboard activation and receives focus", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <IconButton aria-label="Play song">
        <IconX class="size-5" />
      </IconButton>
    ));

    const button = within(container).getByRole("button", { name: "Play song" });
    await user.click(button);
    expect(button).toHaveFocus();
  });

  it("disables while loading and keeps the name", async () => {
    const container = render(() => (
      <IconButton aria-label="Upload" loading>
        <IconX class="size-5" />
      </IconButton>
    ));

    const button = within(container).getByRole("button", { name: "Upload" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("keeps loading dominant over an explicit disabled={false}", () => {
    const container = render(() => (
      <IconButton aria-label="Upload" loading disabled={false}>
        <IconX class="size-5" />
      </IconButton>
    ));

    expect(within(container).getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("marks the active state and exposes toggle semantics", () => {
    const container = render(() => (
      <IconButton aria-label="Shuffle" variant="ghost" active>
        <IconX class="size-5" />
      </IconButton>
    ));

    const button = within(container).getByRole("button", { name: "Shuffle" });
    expect(button).toHaveAttribute("data-active", "true");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("announces the pressed-off state for an inactive toggle", () => {
    const container = render(() => (
      <IconButton aria-label="Shuffle" active={false}>
        <IconX class="size-5" />
      </IconButton>
    ));

    expect(
      within(container).getByRole("button", { name: "Shuffle" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("has no axe violations", async () => {
    render(() => (
      <IconButton aria-label="Close dialog">
        <IconX class="size-5" />
      </IconButton>
    ));

    await expectNoA11yViolations();
  });
});
