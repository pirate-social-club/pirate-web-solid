import { describe, expect, test, vi } from "vitest";
import { within } from "@testing-library/dom";
import { render } from "@/test/test-utils";

import { SharePill } from "./share-pill";

describe("SharePill", () => {
  test("renders the shared engagement treatment and emits the action", async () => {
    const onShare = vi.fn();
    const container = render(() => <SharePill onShare={onShare} />);
    const share = within(container).getByRole("button", { name: "Share" });

    expect(share).toBeVisible();
    share.click();
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
