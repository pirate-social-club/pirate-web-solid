import { within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { PirateBrandMark } from "./pirate-brand-mark";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("PirateBrandMark", () => {
  it("is decorative by default", () => {
    const container = render(() => <PirateBrandMark />);

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img?.getAttribute("draggable") ?? "false").not.toBe("true");
    expect(img).toHaveAttribute("src");
  });

  it("names the brand when not decorative", () => {
    const container = render(() => <PirateBrandMark decorative={false} />);

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "Pirate");
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("accepts a custom alt for non-decorative use", () => {
    const container = render(() => (
      <PirateBrandMark alt="Pirate social" decorative={false} />
    ));

    expect(container.querySelector("img")).toHaveAttribute("alt", "Pirate social");
  });

  it("forwards extra attributes and the ref", () => {
    let refEl: HTMLImageElement | undefined;
    const container = render(() => (
      <PirateBrandMark
        data-testid="brand"
        id="brand-1"
        ref={(el) => {
          refEl = el;
        }}
      />
    ));

    expect(container.querySelector("#brand-1")).not.toBeNull();
    expect(refEl).toBe(container.querySelector("img"));
  });

  it("has no axe violations for decorative and named use", async () => {
    render(() => (
      <div>
        <PirateBrandMark />
        <PirateBrandMark decorative={false} />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
