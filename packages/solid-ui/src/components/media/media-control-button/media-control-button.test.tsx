import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MediaControlButton } from "./media-control-button";
import { IconPlay } from "@/components/media/icons";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("MediaControlButton", () => {
  it("renders a named native button", () => {
    const container = render(() => (
      <MediaControlButton aria-label="Play">
        <IconPlay class="size-5" />
      </MediaControlButton>
    ));

    expect(within(container).getByRole("button", { name: "Play" })).toBeVisible();
  });

  it("fires clicks and disables", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const container = render(() => (
      <MediaControlButton aria-label="Play" onClick={onClick}>
        <IconPlay class="size-5" />
      </MediaControlButton>
    ));

    await user.click(within(container).getByRole("button", { name: "Play" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <MediaControlButton aria-label="Play">
          <IconPlay class="size-5" />
        </MediaControlButton>
        <MediaControlButton aria-label="Play" disabled>
          <IconPlay class="size-5" />
        </MediaControlButton>
      </div>
    ));

    await expectNoA11yViolations();
  });
});
