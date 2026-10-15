import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

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

/** Paper's field: medium-radius chips, the caret at the field's end, no placeholder beside chips. */
async function expectPaperField(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole("combobox", { name: "Sort order" });
  for (const chip of canvas.getAllByRole("button", { name: /^Remove / })) {
    await expect(getComputedStyle(chip).borderRadius).toBe("8px");
  }
  await expect(getComputedStyle(input, "::placeholder").color).toBe("rgba(0, 0, 0, 0)");
  // The control holds the chip-and-input group, then the caret.
  const control = input.parentElement?.parentElement;
  const caret = control?.lastElementChild;
  if (!control || !(caret instanceof HTMLButtonElement)) throw new Error("Expected the caret as the control's last child");
  // The caret ends at the field's 12px inline padding instead of wrapping under the chips.
  await expect(Math.round(control.getBoundingClientRect().right - caret.getBoundingClientRect().right)).toBe(13);
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
    // With nothing selected the placeholder is shown.
    await expect(getComputedStyle(canvas.getByRole("combobox", { name: "Sort order" }), "::placeholder").color).not.toBe("rgba(0, 0, 0, 0)");
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
    await expectPaperField(canvasElement);
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
    await expectPaperField(canvasElement);
  },
};

