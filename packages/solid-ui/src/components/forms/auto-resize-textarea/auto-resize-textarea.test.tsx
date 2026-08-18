import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { AutoResizeTextarea } from "./auto-resize-textarea";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("AutoResizeTextarea", () => {
  it("renders a textbox with one row by default", () => {
    const container = render(() => (
      <AutoResizeTextarea aria-label="Reply" />
    ));

    expect(within(container).getByRole("textbox", { name: "Reply" })).toHaveAttribute("rows", "1");
  });

  it("grows as content is added, capped at maxRows", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <AutoResizeTextarea aria-label="Reply" maxRows={5} />
    ));
    const textarea = within(container).getByRole("textbox", {
      name: "Reply",
    }) as HTMLTextAreaElement;

    // jsdom has no layout: stub the scroll height the browser would compute.
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });

    const before = parseFloat(textarea.style.height) || 0;
    await user.type(textarea, "one\ntwo\nthree");

    // Grows beyond the initial height but stays capped well below the
    // stubbed 300px scroll height (maxRows cap).
    const after = parseFloat(textarea.style.height) || 0;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(200);
  });

  it("composes a consumer ref onto the textarea", () => {
    let captured: HTMLElement | undefined;
    const container = render(() => (
      <AutoResizeTextarea aria-label="Reply" ref={(el) => (captured = el)} />
    ));

    expect(captured).toBe(within(container).getByRole("textbox", { name: "Reply" }));
  });

  it("has no axe violations", async () => {
    render(() => <AutoResizeTextarea aria-label="Reply" />);

    await expectNoA11yViolations();
  });
});
