import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Textarea } from "./textarea";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Textarea", () => {
  it("renders a textbox with the given accessible name", () => {
    const container = render(() => (
      <Textarea aria-label="Notes" placeholder="Write something" />
    ));

    const textarea = within(container).getByRole("textbox", { name: "Notes" });
    expect(textarea).toHaveAttribute("placeholder", "Write something");
  });

  it("accepts typed text", async () => {
    const user = userEvent.setup();
    const container = render(() => <Textarea aria-label="Notes" />);
    const textarea = within(container).getByRole("textbox", {
      name: "Notes",
    });

    await user.type(textarea, "hello solid");
    expect(textarea).toHaveValue("hello solid");
  });

  it("respects the disabled state", () => {
    const container = render(() => (
      <Textarea aria-label="Notes" disabled value="Locked" />
    ));

    expect(within(container).getByRole("textbox")).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => <Textarea aria-label="Notes" placeholder="Write something" />);

    await expectNoA11yViolations();
  });
});
