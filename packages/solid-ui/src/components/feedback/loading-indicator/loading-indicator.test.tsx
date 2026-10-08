import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, render } from "@/test/test-utils";
import { LoadingIndicator } from "./loading-indicator";

describe("LoadingIndicator", () => {
  it("announces one busy status without visible loading copy", async () => {
    const container = render(() => <LoadingIndicator label="Loading community" />);
    expect(within(container).getAllByRole("status")).toHaveLength(1);
    expect(within(container).getByRole("status", { name: "Loading community" })).toHaveAttribute("aria-busy", "true");
    expect(container.textContent).toBe("");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("svg")).toHaveClass("motion-reduce:animate-none");
    await expectNoA11yViolations();
  });
  it("updates its accessible name and retains caller geometry and attributes", async () => {
    const [label, setLabel] = createSignal("Loading profile");
    const container = render(() => <LoadingIndicator label={label()} variant="inline" class="min-h-64" data-loading="profile" />);
    setLabel("جارٍ التحميل");
    await vi.waitFor(() => expect(within(container).getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument());
    const status = within(container).getByRole("status", { name: "جارٍ التحميل" });
    expect(status).toHaveClass("min-h-64");
    expect(status).toHaveAttribute("data-loading", "profile");
  });
  it("fills a page and uses the larger spinner", () => {
    const container = render(() => <LoadingIndicator variant="page" />);
    expect(within(container).getByRole("status", { name: "Loading" })).toHaveClass("min-h-dvh");
    expect(container.querySelector("svg")).toHaveClass("size-8");
  });
});
