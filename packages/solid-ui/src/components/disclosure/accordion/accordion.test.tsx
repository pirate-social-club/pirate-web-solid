import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function AccordionFixture(props: { defaultValue?: string[] }) {
  return (
    <Accordion defaultValue={props.defaultValue ?? ["item-1"]}>
      <AccordionItem value="item-1">
        <AccordionHeader>
          <AccordionTrigger>First section</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>First content</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionHeader>
          <AccordionTrigger>Second section</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>Second content</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionHeader>
          <AccordionTrigger>Third section</AccordionTrigger>
        </AccordionHeader>
        <AccordionContent>Third content</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

describe("Accordion", () => {
  it("expands the default item and unmounts closed content", () => {
    const container = render(() => <AccordionFixture />);

    const first = within(container).getByRole("button", { name: "First section" });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(first).toHaveAttribute("aria-controls");
    expect(within(container).getByText("First content")).toBeVisible();
    expect(within(container).queryByText("Second content")).not.toBeInTheDocument();
  });

  it("moves expansion on click and reports onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Accordion defaultValue={["item-1"]} onChange={onChange}>
        <AccordionItem value="item-1">
          <AccordionHeader>
            <AccordionTrigger>First section</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>First content</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionHeader>
            <AccordionTrigger>Second section</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>Second content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    await user.click(within(container).getByRole("button", { name: "Second section" }));
    flush();
    expect(onChange).toHaveBeenCalledWith(["item-2"]);
    expect(
      within(container).getByRole("button", { name: "First section" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(within(container).getByText("Second content")).toBeVisible();
  });

  it("toggles an open section with Enter in collapsible mode", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <Accordion defaultValue={["item-1"]} collapsible>
        <AccordionItem value="item-1">
          <AccordionHeader>
            <AccordionTrigger>First section</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>First content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    const trigger = within(container).getByRole("button", { name: "First section" });
    trigger.focus();
    await user.keyboard("{Enter}");
    flush();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(within(container).queryByText("First content")).not.toBeInTheDocument();
  });

  it("navigates triggers with arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    const container = render(() => <AccordionFixture />);

    const first = within(container).getByRole("button", { name: "First section" });
    const second = within(container).getByRole("button", { name: "Second section" });
    const third = within(container).getByRole("button", { name: "Third section" });

    first.focus();
    await user.keyboard("{ArrowDown}");
    flush();
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowDown}");
    flush();
    expect(third).toHaveFocus();

    await user.keyboard("{Home}");
    flush();
    expect(first).toHaveFocus();

    await user.keyboard("{End}");
    flush();
    expect(third).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    flush();
    expect(second).toHaveFocus();

    await user.keyboard("{Enter}");
    flush();
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(within(container).getByText("Second content")).toBeVisible();
  });

  it("marks disabled items as unavailable", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <Accordion defaultValue={["item-2"]}>
        <AccordionItem value="item-1" disabled>
          <AccordionHeader>
            <AccordionTrigger>Locked section</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>Locked content</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionHeader>
            <AccordionTrigger>Open section</AccordionTrigger>
          </AccordionHeader>
          <AccordionContent>Open content</AccordionContent>
        </AccordionItem>
      </Accordion>
    ));

    const locked = within(container).getByRole("button", { name: "Locked section" });
    expect(locked).toBeDisabled();
    await user.click(locked);
    flush();
    expect(locked).toHaveAttribute("aria-expanded", "false");
    expect(within(container).getByText("Open content")).toBeVisible();
  });

  it("has no axe violations", async () => {
    render(() => <AccordionFixture />);

    await expectNoA11yViolations();
  });
});
