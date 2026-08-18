import { userEvent } from "@testing-library/user-event";
import { within } from "@testing-library/dom";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import {
  RadioGroup,
  RadioGroupItem,
  RadioGroupLabel,
} from "./radio-group";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function renderGroup(props: {
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return render(() => (
    <RadioGroup
      aria-label="Sort order"
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
    >
      <RadioGroupItem value="new">Newest</RadioGroupItem>
      <RadioGroupItem value="top">Top rated</RadioGroupItem>
      <RadioGroupItem value="old">Oldest</RadioGroupItem>
    </RadioGroup>
  ));
}

describe("RadioGroup", () => {
  it("renders a radiogroup with named radio items", () => {
    const container = renderGroup({});

    const view = within(container);
    expect(view.getByRole("radiogroup", { name: "Sort order" })).toBeInTheDocument();
    expect(view.getAllByRole("radio")).toHaveLength(3);
  });

  it("selects an item on click and reports the value", async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal<string | undefined>(undefined);
    const container = render(() => (
      <RadioGroup aria-label="Sort order" value={value()} onChange={setValue}>
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="top">Top rated</RadioGroupItem>
      </RadioGroup>
    ));
    flush();

    await user.click(within(container).getByRole("radio", { name: "Top rated" }));

    expect(value()).toBe("top");
    expect(within(container).getByRole("radio", { name: "Top rated" })).toBeChecked();
  });

  it("moves selection with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <RadioGroup aria-label="Sort order" onChange={onChange}>
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="top">Top rated</RadioGroupItem>
        <RadioGroupItem value="old">Oldest</RadioGroupItem>
      </RadioGroup>
    ));
    flush();

    const radios = within(container).getAllByRole("radio");
    radios[0]!.focus();
    await user.keyboard("{ArrowDown}");

    expect(onChange).toHaveBeenLastCalledWith("top");
    expect(radios[1]).toHaveFocus();
  });

  it("supports disabled items", async () => {
    const user = userEvent.setup();
    const container = render(() => (
      <RadioGroup aria-label="Sort order">
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="old" disabled>
          Oldest
        </RadioGroupItem>
      </RadioGroup>
    ));
    flush();

    const disabled = within(container).getByRole("radio", { name: "Oldest" });
    expect(disabled).toBeDisabled();

    await user.click(disabled);
    expect(disabled).not.toBeChecked();
  });

  it("associates a group label", () => {
    const container = render(() => (
      <RadioGroup>
        <RadioGroupLabel>Sort order</RadioGroupLabel>
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="old">Oldest</RadioGroupItem>
      </RadioGroup>
    ));
    flush();

    expect(
      within(container).getByRole("radiogroup", { name: "Sort order" }),
    ).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    renderGroup({});

    await expectNoA11yViolations();
  });
});
