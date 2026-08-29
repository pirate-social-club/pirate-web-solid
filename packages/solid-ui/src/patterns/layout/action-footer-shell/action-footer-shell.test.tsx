import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { ActionFooterShell } from "./action-footer-shell";

function shell(container: HTMLElement) {
  return container.querySelector("[data-action-footer-shell]") as HTMLElement;
}
function body(container: HTMLElement) {
  return container.querySelector("[data-action-footer-shell-body]") as HTMLElement;
}
function footer(container: HTMLElement) {
  return container.querySelector("[data-action-footer-shell-footer]") as HTMLElement;
}

describe("ActionFooterShell", () => {
  it("renders header, body, and footer regions in order", () => {
    const container = render(() => (
      <ActionFooterShell
        header={<h1>Create community</h1>}
        footer={<button type="button">Create</button>}
      >
        <p>Body content</p>
      </ActionFooterShell>
    ));

    const regions = container.querySelectorAll(
      "[data-action-footer-shell-header],[data-action-footer-shell-body],[data-action-footer-shell-footer]",
    );
    expect([...regions].map((node) => node.getAttribute("data-action-footer-shell-header") === ""
      ? "header"
      : node.getAttribute("data-action-footer-shell-body") === ""
        ? "body"
        : "footer")).toEqual(["header", "body", "footer"]);
  });

  it("omits the header region entirely when no header is given", () => {
    const container = render(() => (
      <ActionFooterShell footer={<button type="button">Create</button>}>
        <p>Body content</p>
      </ActionFooterShell>
    ));

    expect(container.querySelector("[data-action-footer-shell-header]")).toBeNull();
  });

  /**
   * The bug this component exists to prevent: a `sticky bottom-0` footer as
   * the last child of its parent has no sticky range and scrolls away on a
   * short viewport. The footer must be a flex sibling of the scrolling body.
   */
  it("pins the footer as a flex sibling rather than a sticky element", () => {
    const container = render(() => (
      <ActionFooterShell footer={<button type="button">Create</button>}>
        <p>Body content</p>
      </ActionFooterShell>
    ));

    expect(footer(container).className).not.toContain("sticky");
    expect(footer(container).className).toContain("shrink-0");
    expect(body(container).parentElement).toBe(footer(container).parentElement);
  });

  /**
   * A flex child will not shrink below its content height without min-h-0, so
   * without it the body refuses to scroll and pushes the footer off-screen.
   */
  it("lets the body scroll by allowing it to shrink below its content", () => {
    const container = render(() => (
      <ActionFooterShell footer={<button type="button">Create</button>}>
        <p>Body content</p>
      </ActionFooterShell>
    ));

    expect(shell(container).className).toContain("min-h-0");
    expect(body(container).className).toContain("min-h-0");
    expect(body(container).className).toContain("flex-1");
    expect(body(container).className).toContain("overflow-y-auto");
  });

  /**
   * axe's scrollable-region-focusable: a body that scrolls but holds nothing
   * focusable is unreachable by keyboard. Caught by the catalog sweep, not by
   * these tests, since jsdom has neither layout nor axe.
   */
  it("keeps the scrolling body reachable by keyboard", () => {
    const container = render(() => (
      <ActionFooterShell footer={<button type="button">Create</button>}>
        <p>Body content</p>
      </ActionFooterShell>
    ));

    expect(body(container).getAttribute("tabindex")).toBe("0");
  });

  it("fills the parent by default and the viewport on request", () => {
    const parent = render(() => (
      <ActionFooterShell footer={<button type="button">Create</button>}>
        <p>Body</p>
      </ActionFooterShell>
    ));
    expect(shell(parent).className).toContain("h-full");

    const viewport = render(() => (
      <ActionFooterShell fullViewport footer={<button type="button">Create</button>}>
        <p>Body</p>
      </ActionFooterShell>
    ));
    expect(shell(viewport).className).toContain("h-dvh");
  });

  it("has no accessibility violations", async () => {
    render(() => (
      <ActionFooterShell
        header={<h1>Create community</h1>}
        footer={<button type="button">Create</button>}
      >
        <p>Body content</p>
      </ActionFooterShell>
    ));

    await expectNoA11yViolations();
  });
});
