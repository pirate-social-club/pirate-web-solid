import { userEvent } from "@testing-library/user-event";
import { screen, within } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/actions/button/button";
import { toast, Toaster } from "./toast";

function clearToasts() {
  toast.clear();
}

afterEach(clearToasts);
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderToaster() {
  return render(() => (
    <>
      <Button
        onClick={() =>
          toast.show({
            title: "Copied to clipboard",
            description: "The link is ready to paste.",
            type: "info",
            duration: 60000,
          })
        }
      >
        Show toast
      </Button>
      <Button onClick={() => toast.error("Payment failed", { duration: 60000 })}>
        Show error toast
      </Button>
      <Toaster />
    </>
  ));
}

describe("Toast", () => {
  it("shows an informational toast in a polite status region", async () => {
    const user = userEvent.setup();
    const container = renderToaster();

    await user.click(within(container).getByRole("button", { name: "Show toast" }));

    const title = await screen.findByText("Copied to clipboard");
    expect(title).toBeVisible();
    const status = screen.getByRole("status");
    expect(status).toContainElement(title);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("The link is ready to paste.")).toBeVisible();
  });

  it("announces error toasts assertively", async () => {
    const user = userEvent.setup();
    const container = renderToaster();

    await user.click(
      within(container).getByRole("button", { name: "Show error toast" }),
    );

    const title = await screen.findByText("Payment failed");
    const status = screen.getByRole("status");
    expect(status).toContainElement(title);
    expect(status).toHaveAttribute("aria-live", "assertive");
  });

  it("dismisses through the close button", async () => {
    const user = userEvent.setup();
    const container = renderToaster();

    await user.click(within(container).getByRole("button", { name: "Show toast" }));
    await screen.findByText("Copied to clipboard");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() =>
      expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument(),
    );
  });

  it("has no axe violations while a toast is shown", async () => {
    const user = userEvent.setup();
    const container = renderToaster();

    await user.click(within(container).getByRole("button", { name: "Show toast" }));
    await screen.findByText("Copied to clipboard");

    await expectNoA11yViolations();
  });
});
