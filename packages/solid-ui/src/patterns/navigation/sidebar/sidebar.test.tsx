import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./index";

function SidebarFixture(props: { defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <SidebarProvider defaultOpen={props.defaultOpen} onOpenChange={props.onOpenChange}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <span>Brand</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive tooltip="Home">
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <SidebarTrigger label="Toggle sidebar" />
        <span>Content</span>
      </SidebarInset>
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("renders expanded by default with navigation content", () => {
    const container = render(() => <SidebarFixture />);

    expect(container.querySelector("[data-side]")).toHaveAttribute(
      "data-state",
      "expanded",
    );
    expect(within(container).getByText("Home")).toBeVisible();
  });

  it("toggles through the trigger and reports through onOpenChange", async () => {
    const user = userEvent.setup();
    const states: boolean[] = [];
    const container = render(() => (
      <SidebarFixture onOpenChange={(open) => states.push(open)} />
    ));

    await user.click(within(container).getByRole("button", { name: "Toggle sidebar" }));
    expect(states).toEqual([false]);
  });

  it("collapses to the icon rail when defaultOpen is false", () => {
    const container = render(() => <SidebarFixture defaultOpen={false} />);

    const sidebar = container.querySelector("[data-side]");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsible", "icon");
  });

  it("toggles on the Cmd/Ctrl+B keyboard shortcut", async () => {
    const user = userEvent.setup();
    const container = render(() => <SidebarFixture />);

    await user.keyboard("{Control>}b{/Control}");
    expect(container.querySelector("[data-side]")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  });

  it("has no automated a11y violations", async () => {
    render(() => <SidebarFixture />);

    await expectNoA11yViolations();
  });
});
