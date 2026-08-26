import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { ListRow } from "./list-row";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("ListRow", () => {
  it("renders title, description, and both slots", () => {
    const container = render(() => (
      <ListRow
        description="Members verify before joining."
        leading={<span data-testid="leading" />}
        title="Palm scan"
        trailing={<span data-testid="trailing" />}
      />
    ));

    const view = within(container);
    expect(view.getByText("Palm scan")).toBeInTheDocument();
    expect(view.getByText("Members verify before joining.")).toBeInTheDocument();
    expect(view.getByTestId("leading")).toBeInTheDocument();
    expect(view.getByTestId("trailing")).toBeInTheDocument();
  });

  // A row that does nothing must not borrow a control's affordance.
  it("is inert without onClick and a button with it", async () => {
    const inert = render(() => <ListRow title="Palm scan" />);
    expect(within(inert).queryByRole("button")).toBeNull();

    const onClick = vi.fn();
    const user = userEvent.setup();
    const interactive = render(() => <ListRow onClick={onClick} title="Palm scan" />);
    await user.click(within(interactive).getByRole("button", { name: "Palm scan" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a list item when asked", () => {
    const container = render(() => (
      <ul>
        <ListRow as="li" title="Palm scan" />
      </ul>
    ));
    expect(within(container).getByRole("listitem")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    render(() => (
      <ListRow description="Members verify before joining." onClick={() => undefined} title="Palm scan" />
    ));
    await expectNoA11yViolations();
  });
});
