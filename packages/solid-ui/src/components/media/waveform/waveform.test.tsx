import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { Waveform } from "./waveform";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("Waveform", () => {
  it("generates deterministic peaks from the seed", () => {
    const first = render(() => <Waveform seed="midnight-waves" count={24} />);
    const second = render(() => <Waveform seed="midnight-waves" count={24} />);
    const third = render(() => <Waveform seed="different-seed" count={24} />);

    const barsOf = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("span")).map((span) => span.getAttribute("style"));

    expect(barsOf(first)).toEqual(barsOf(second));
    expect(barsOf(first)).not.toEqual(barsOf(third));
    expect(barsOf(first)).toHaveLength(24);
  });

  it("normalizes explicit peaks and marks the played range", () => {
    const container = render(() => (
      <Waveform peaks={[0.1, 0.5, 0.9, 0.2]} seed="explicit" progressFraction={0.5} />
    ));

    const bars = Array.from(container.querySelectorAll("span"));
    expect(bars).toHaveLength(4);
    expect(bars[0].className).toContain("text-primary");
    expect(bars[1].className).toContain("text-primary");
    expect(bars[2].className).toContain("text-muted-foreground/30");
    expect(bars[3].className).toContain("text-muted-foreground/30");
  });

  it("is hidden from the accessibility tree", () => {
    const container = render(() => <Waveform seed="midnight-waves" />);

    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    expect(within(container).queryAllByRole("img")).toHaveLength(0);
  });

  it("has no axe violations", async () => {
    render(() => (
      <div class="bg-card">
        <Waveform seed="midnight-waves" progressFraction={0.4} />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
