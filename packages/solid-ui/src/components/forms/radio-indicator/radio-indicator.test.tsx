import { describe, expect, it } from "vitest";

import { RadioIndicator } from "./radio-indicator";
import { render } from "@/test/test-utils";

describe("RadioIndicator", () => {
  it("renders a presentational dot", () => {
    const container = render(() => <RadioIndicator />);

    expect(container.firstChild).toBeInstanceOf(HTMLSpanElement);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("reflects the checked state", () => {
    const container = render(() => <RadioIndicator checked />);

    expect(container.querySelector("[data-checked]")).not.toBeNull();
  });

  it("renders without the checked state by default", () => {
    const container = render(() => <RadioIndicator />);

    expect(container.querySelector("[data-checked]")).toBeNull();
  });
});
