import { describe, expect, it } from "vitest";

import { render } from "@/test/test-utils";

import { IconHouse, IconX } from "./icons";

describe("generated Phosphor icons", () => {
  it("preserves the shared SVG API and emits regular/fill variants", () => {
    const container = render(() => (
      <div>
        <IconX aria-hidden="false" class="size-5" />
        <IconHouse class="size-5" />
        <IconHouse class="size-5" filled />
      </div>
    ));

    const icons = [...container.querySelectorAll("svg")];
    expect(icons).toHaveLength(3);
    expect(icons[0]).toHaveAttribute("aria-hidden", "false");
    expect(icons[0]).toHaveClass("size-5");
    expect(icons[0]).toHaveAttribute("fill", "currentColor");
    expect(icons[0]).toHaveAttribute("viewBox", "0 0 256 256");
    expect(icons[1]?.innerHTML).not.toBe(icons[2]?.innerHTML);
  });
});
