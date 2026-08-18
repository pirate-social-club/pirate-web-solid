import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function TabsFixture(props: { defaultValue?: string }) {
  return (
    <Tabs defaultValue={props.defaultValue ?? "account"}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p>Account content</p>
      </TabsContent>
      <TabsContent value="password">
        <p>Password content</p>
      </TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("selects the default trigger and shows only its pane", () => {
    const container = render(() => <TabsFixture />);

    expect(within(container).getByRole("tab", { name: "Account" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(container).getByText("Account content")).toBeVisible();
    expect(within(container).queryByText("Password content")).not.toBeInTheDocument();
  });

  it("switches panes on click and reports onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Tabs defaultValue="account" onChange={onChange}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>
        <TabsContent value="account"><p>Account content</p></TabsContent>
        <TabsContent value="password"><p>Password content</p></TabsContent>
      </Tabs>
    ));

    await user.click(within(container).getByRole("tab", { name: "Password" }));
    flush();
    expect(onChange).toHaveBeenCalledWith("password");
    expect(within(container).getByText("Password content")).toBeVisible();
    expect(within(container).queryByText("Account content")).not.toBeInTheDocument();
  });

  it("moves selection with arrow keys from the focused trigger", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Overview</TabsTrigger>
          <TabsTrigger value="tab2">Analytics</TabsTrigger>
          <TabsTrigger value="tab3">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1"><p>Overview content</p></TabsContent>
        <TabsContent value="tab2"><p>Analytics content</p></TabsContent>
        <TabsContent value="tab3"><p>Reports content</p></TabsContent>
      </Tabs>
    ));

    within(container).getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("{ArrowRight}");
    flush();
    expect(within(container).getByRole("tab", { name: "Analytics" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("marks disabled triggers as unavailable", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="locked" disabled>Locked</TabsTrigger>
        </TabsList>
        <TabsContent value="active"><p>Active content</p></TabsContent>
        <TabsContent value="locked"><p>Locked content</p></TabsContent>
      </Tabs>
    ));

    const locked = within(container).getByRole("tab", { name: "Locked" });
    expect(locked).toBeDisabled();

    await user.click(locked);
    flush();
    expect(within(container).getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("provides the underline visual variant", () => {
    const container = render(() => (
      <Tabs defaultValue="account">
        <TabsList columns={2} variant="underline">
          <TabsTrigger value="account" variant="underline">Account</TabsTrigger>
          <TabsTrigger value="password" variant="underline">Password</TabsTrigger>
        </TabsList>
      </Tabs>
    ));

    const list = within(container).getByRole("tablist");
    expect(list).toHaveClass("border-b", "grid");
    expect(list.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    const account = within(container).getByRole("tab", { name: "Account" });
    expect(account).toHaveAttribute("data-selected");
    expect(account).toHaveClass("border-b-2", "border-transparent");
  });

  it("has no axe violations", async () => {
    render(() => <TabsFixture />);

    await expectNoA11yViolations();
  });
});
