import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import { StoryStack } from "@/stories/lib/story-layout";
import {
  RadioGroup,
  RadioGroupItem,
} from "./radio-group";

const meta = {
  title: "Components/Forms/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.value,
    (value, setValue, args) => (
      <RadioGroup
        {...args}
        aria-label="Sort order"
        value={value()}
        onChange={(next) => {
          setValue(next);
          args.onChange?.(next);
        }}
      >
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="top">Top rated</RadioGroupItem>
        <RadioGroupItem value="old">Oldest</RadioGroupItem>
      </RadioGroup>
    ),
  ),
  args: {
    value: "new",
    orientation: "horizontal",
    onChange: fn(),
  },
  argTypes: {
    value: {
      control: "select",
      options: ["new", "top", "old"],
    },
    validationState: {
      control: "select",
      options: ["valid", "invalid"],
    },
    onChange: { table: { disable: true } },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A segmented set of mutually exclusive choices. Use it for short option lists that all need to stay visible. Arrow keys move selection through the shared native radio inputs. Do not use it for long lists of text-heavy options: that is a Select.",
      },
    },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const radio = canvas.getByRole("radio", { name: "Top rated" });

    await userEvent.click(radio);
    await expect(args.onChange).toHaveBeenCalledWith("top");
    await expect(radio).toBeChecked();
  },
};

export const Disabled: Story = {
  render: () => (
    <StoryStack>
      <RadioGroup aria-label="Disabled group" disabled orientation="horizontal">
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="top">Top rated</RadioGroupItem>
        <RadioGroupItem value="old">Oldest</RadioGroupItem>
      </RadioGroup>
      <RadioGroup aria-label="Group with a disabled item" defaultValue="new" orientation="horizontal">
        <RadioGroupItem value="new">Newest</RadioGroupItem>
        <RadioGroupItem value="top">Top rated</RadioGroupItem>
        <RadioGroupItem value="old" disabled>
          Oldest
        </RadioGroupItem>
      </RadioGroup>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const disabledGroup = canvas.getByRole("radiogroup", {
      name: "Disabled group",
    });
    for (const radio of within(disabledGroup).getAllByRole("radio")) {
      await expect(radio).toBeDisabled();
    }

    const mixedGroup = canvas.getByRole("radiogroup", {
      name: "Group with a disabled item",
    });
    await expect(
      within(mixedGroup).getByRole("radio", { name: "Oldest" }),
    ).toBeDisabled();
    await expect(
      within(mixedGroup).getByRole("radio", { name: "Newest" }),
    ).toBeEnabled();
  },
};

export const Error: Story = {
  render: () => (
    <RadioGroup
      aria-label="Sort order"
      defaultValue="new"
      orientation="horizontal"
      validationState="invalid"
      description="Controls the order of the list."
      errorMessage="Pick a sort order."
    >
      <RadioGroupItem value="new">Newest</RadioGroupItem>
      <RadioGroupItem value="top">Top rated</RadioGroupItem>
      <RadioGroupItem value="old">Oldest</RadioGroupItem>
    </RadioGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const error = canvas.getByText("Pick a sort order.");
    await expect(error).toBeInTheDocument();
    // Paper: description and error sit below the tinted track, not inside it,
    // stacked 6px apart.
    const group = canvas.getByRole("radiogroup");
    const track = group.firstElementChild;
    if (!(track instanceof HTMLElement)) throw new globalThis.Error("track not found");
    await expect(within(track).getAllByRole("radio")).toHaveLength(3);
    await expect(track).not.toHaveTextContent("Controls the order of the list.");
    const trackBox = track.getBoundingClientRect();
    const description = canvas.getByText("Controls the order of the list.").getBoundingClientRect();
    const errorBox = error.getBoundingClientRect();
    await expect(Math.round(description.top - trackBox.bottom)).toBe(6);
    await expect(Math.round(errorBox.top - description.bottom)).toBe(6);
    await expect(canvas.getByRole("radiogroup")).toHaveAccessibleDescription(/Controls the order of the list\./);
  },
};

/** Paper draws the group as one row of equal columns. */
export const HorizontalRow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const labels = ["Newest", "Top rated", "Oldest"].map((name) =>
      canvas.getByText(name).getBoundingClientRect(),
    );
    const [first] = labels;
    if (!first) throw new globalThis.Error("no items");
    for (const box of labels) {
      await expect(Math.abs(box.top - first.top)).toBeLessThan(1);
      await expect(Math.abs(box.width - first.width)).toBeLessThan(1);
    }
  },
};
