import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Scrubber } from "./scrubber";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Scrubber", () => {
  it("exposes the controlled value as a named slider", () => {
    const container = render(() => (
      <Scrubber ariaLabel="Playback position" value={32} />
    ));

    const slider = within(container).getByRole("slider", { name: "Playback position" });
    expect(slider).toHaveAttribute("aria-valuenow", "32");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
  });

  it("steps the value with arrow keys and reports through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Scrubber ariaLabel="Playback position" onChange={onChange} step={10} value={30} />
    ));

    const slider = within(container).getByRole("slider", { name: "Playback position" });
    slider.focus();

    await user.keyboard("{ArrowRight}");
    flush();
    expect(onChange).toHaveBeenLastCalledWith(40);

    await user.keyboard("{ArrowLeft}");
    flush();
    expect(onChange).toHaveBeenLastCalledWith(20);

    await user.keyboard("{End}");
    flush();
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("uses the custom value text for assistive technology", () => {
    const container = render(() => (
      <Scrubber ariaLabel="Playback position" ariaValueText="1 minute 5 seconds" value={65} />
    ));

    expect(within(container).getByRole("slider")).toHaveAttribute(
      "aria-valuetext",
      "1 minute 5 seconds",
    );
  });

  it("shows the value bubble on focus and hides it on blur", () => {
    const container = render(() => (
      <Scrubber
        ariaLabel="Playback position"
        showValueBubble
        value={42}
        valueLabel="0:42"
      />
    ));

    const slider = within(container).getByRole("slider");
    expect(within(container).queryByText("0:42")).not.toBeInTheDocument();

    slider.focus();
    flush();
    expect(within(container).getByText("0:42")).toBeInTheDocument();

    slider.blur();
    flush();
    expect(within(container).queryByText("0:42")).not.toBeInTheDocument();
  });

  it("disables interaction", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Scrubber ariaLabel="Playback position" disabled onChange={onChange} value={30} />
    ));

    const slider = within(container).getByRole("slider");
    expect(slider).toHaveAttribute("data-disabled");
    expect(slider).not.toHaveAttribute("tabindex");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    flush();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    render(() => <Scrubber ariaLabel="Playback position" showThumb value={40} />);

    await expectNoA11yViolations();
  });
});
