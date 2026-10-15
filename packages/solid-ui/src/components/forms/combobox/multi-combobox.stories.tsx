import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import {
  optionDisabled,
  optionLabel,
  optionValue,
  sortOptions,
  type DemoOption,
} from "@/stories/lib/fixtures";
import { boardWidth, widthOf } from "@/stories/lib/story-measure";
import { MultiCombobox, type MultiComboboxProps } from "./multi-combobox";

/** Paper draws the field 320px wide on desktop and 358px in the phone frame. */
function renderField(wrapperClass: string) {
  return controlledRender<MultiComboboxProps<DemoOption>, readonly string[] | undefined>(
    (args) => args.value,
    (value, setValue, args) => (
      <div class={wrapperClass} data-testid="multi-combobox-frame">
        <MultiCombobox
          {...args}
          aria-label="Sort order"
          value={value()}
          onChange={(next) => {
            setValue(next);
            args.onChange?.(next);
          }}
        />
      </div>
    ),
  );
}

const meta = {
  title: "Components/Forms/MultiCombobox",
  component: MultiCombobox,
  tags: ["autodocs"],
  render: renderField("w-80 max-w-full"),
  args: {
    onChange: fn(),
    options: sortOptions,
    optionValue,
    optionLabel,
    optionDisabled,
    placeholder: "Search",
  },
  argTypes: {
    onChange: { table: { disable: true } },
    options: { table: { disable: true } },
    optionValue: { table: { disable: true } },
    optionLabel: { table: { disable: true } },
    optionDisabled: { table: { disable: true } },
    class: { table: { disable: true } },
    inputClass: { table: { disable: true } },
    contentClass: { table: { disable: true } },
    value: { table: { disable: true } },
    defaultValue: { table: { disable: true } },
    removeLabel: { table: { disable: true } },
  },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof MultiCombobox<DemoOption>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox", { name: "Sort order" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Remove / })).toBeNull();
    await expect(canvas.getByRole("combobox", { name: "Sort order" })).toHaveAttribute("placeholder", "Search");
  },
};

export const WithChips: Story = {
  name: "Selected values as chips",
  args: { value: ["top", "new"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Paper ends this state with both chips in the field.
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    await expect(widthOf(canvas.getByTestId("multi-combobox-frame"))).toBe(boardWidth(320));
  },
};

/** Removing a chip from the field; kept apart so WithChips rests on the board state. */
export const RemoveChip: Story = {
  args: { value: ["top", "new"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);

    await userEvent.click(canvas.getByRole("button", { name: "Remove Newest" }));
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
  },
};

export const Disabled: Story = {
  args: { disabled: true, value: ["top"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox", { name: "Sort order" })).toBeDisabled();
    // Paper: one chip leaves room for the caret on the chip's row.
    const chip = canvas.getByRole("button", { name: "Remove Top rated" }).getBoundingClientRect();
    const caretBox = caretOf(canvasElement).getBoundingClientRect();
    await expect(Math.abs(caretBox.top + caretBox.height / 2 - (chip.top + chip.height / 2))).toBeLessThanOrEqual(1);
  },
};

/** The trigger button of the field: the only button that is not a chip. */
function caretOf(canvasElement: HTMLElement): HTMLElement {
  const caret = [...canvasElement.querySelectorAll("button")].find(
    (button) => !button.getAttribute("aria-label")?.startsWith("Remove "),
  );
  if (!caret) throw new Error("MultiCombobox caret not found");
  return caret;
}

/** Paper's chip geometry inside the field, measured at the board's two-chip state. */
export const ChipGeometry: Story = {
  name: "Chip geometry",
  args: { value: ["top", "new"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chips = canvas.getAllByRole("button", { name: /^Remove / });
    await expect(chips).toHaveLength(2);
    // Medium radius (8px), not the standalone full pill.
    for (const chip of chips) {
      await expect(getComputedStyle(chip).borderTopLeftRadius).toBe("8px");
    }
    // No placeholder once chips name the selection.
    const input = canvas.getByRole("combobox", { name: "Sort order" });
    await expect(input.getAttribute("placeholder") ?? "").toBe("");
    // The caret wraps with the input to a second row and ends it, flush with
    // the field's 12px inner edge, instead of starting that row on the left.
    // Input and caret share one wrapper inside the bordered control.
    const control = input.parentElement?.parentElement as HTMLElement;
    const caret = caretOf(canvasElement).getBoundingClientRect();
    const chipBottom = Math.max(...chips.map((chip) => chip.getBoundingClientRect().bottom));
    await expect(caret.top).toBeGreaterThanOrEqual(chipBottom);
    const controlBox = control.getBoundingClientRect();
    await expect(Math.abs(controlBox.right - 1 - 12 - caret.right)).toBeLessThanOrEqual(1);
    const inputBox = input.getBoundingClientRect();
    await expect(Math.abs(inputBox.top + inputBox.height / 2 - (caret.top + caret.height / 2))).toBeLessThanOrEqual(1);
  },
};

export const Mobile: Story = {
  args: { value: ["top", "new"] },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  // A 390 phone leaves a 358px content column after 16px gutters.
  render: renderField("w-[358px] max-w-[calc(100vw-2rem)]"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("multi-combobox-frame");
    await expect(widthOf(frame)).toBe(boardWidth(358));
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
  },
};


/** Paper opens the option list 4px below the field, as on Select and Combobox. */
export const ListGap: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Sort order" });
    // Input and caret share one wrapper inside the bordered control.
    const field = input.parentElement?.parentElement;
    if (!(field instanceof HTMLElement)) throw new Error("no multi-combobox control");
    await userEvent.click(caretOf(canvasElement));
    const listbox = await within(document.body).findByRole("listbox");
    const positioner = listbox.closest("[data-popper-positioner]");
    if (!(positioner instanceof HTMLElement)) throw new Error("no popper positioner");
    await waitFor(() =>
      expect(Math.round(positioner.getBoundingClientRect().top - field.getBoundingClientRect().bottom)).toBe(4),
    );
    await userEvent.keyboard("{Escape}");
  },
};
