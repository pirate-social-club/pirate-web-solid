/** @jsxImportSource @solidjs/web */

import { renderToString } from "@solidjs/web";
import { createComponent } from "solid-js";
import { describe, expect, test } from "vitest";

import { ActivityProgressHeader } from "./activity-progress-header";

function renderHeader(props: Partial<Parameters<typeof ActivityProgressHeader>[0]> = {}) {
  return renderToString(() =>
    createComponent(ActivityProgressHeader, {
      progressMax: 10,
      progressValue: 4,
      onExit: () => undefined,
      ...props,
    }),
  );
}

describe("ActivityProgressHeader", () => {
  // The component clamps rather than trusting its inputs, so an out-of-range
  // value must not overflow the track or report a nonsensical aria-valuenow.
  test("clamps a value beyond the maximum to the maximum", () => {
    const html = renderHeader({ progressValue: 99 });
    expect(html).toContain('aria-valuenow="10"');
  });

  test("clamps a negative value to zero", () => {
    const html = renderHeader({ progressValue: -3 });
    expect(html).toContain('aria-valuenow="0"');
  });

  test("reports the in-range value unchanged", () => {
    const html = renderHeader({ progressValue: 4 });
    expect(html).toContain('aria-valuenow="4"');
  });
});
