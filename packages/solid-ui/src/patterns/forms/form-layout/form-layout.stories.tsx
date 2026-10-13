import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Input } from "@/components/forms/input/input";
import { FormFieldLabel, FormNote, FormSectionHeading } from "./form-layout";

const meta = {
  title: "Patterns/Forms/FormLayout",
  component: FormFieldLabel,
  tags: ["autodocs"],
  args: {
    label: "Display name",
    htmlFor: "name",
    required: false,
    counter: "12 / 140",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["default", "muted"],
    },
    required: { control: "boolean" },
    counter: { control: "text" },
    labelClass: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The standard form furniture: FormFieldLabel (field header with optional required marker and counter), FormSectionHeading (section title with supporting description), and FormNote (supporting copy in four tones). Compose them around TextField, Select, and Combobox fields. FormFieldLabel is the representative export documented here.",
      },
    },
  },
} satisfies Meta<typeof FormFieldLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div class="flex w-96 flex-col gap-6">
      <FormSectionHeading
        title="Profile"
        description="Shown on your public page."
      />
      <div class="flex flex-col gap-1.5">
        <FormFieldLabel
          htmlFor={args.htmlFor}
          label={args.label}
          required={args.required}
          tone={args.tone}
        />
        <Input id={args.htmlFor} />
        <FormNote tone="muted">2 to 30 characters.</FormNote>
      </div>
      <div class="flex flex-col gap-1.5">
        <FormFieldLabel htmlFor="bio" label="Bio" counter={args.counter} />
        <Input id="bio" />
        <FormNote tone="destructive">This bio is too long.</FormNote>
      </div>
    </div>
  ),
};

/** Paper's FormFieldLabel variants: plain, required, with a counter, and muted. */
export const LabelVariants: Story = {
  name: "FormFieldLabel variants",
  render: () => (
    <div class="flex w-96 flex-col gap-3" data-testid="label-variants">
      <FormFieldLabel label="Display name" />
      <FormFieldLabel label="Display name" required />
      <FormFieldLabel counter="12 / 140" label="Display name" />
      <FormFieldLabel label="Optional" tone="muted" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = Array.from(canvas.getByTestId("label-variants").children);
    await expect(rows).toHaveLength(4);
    // Required adds the hidden asterisk; the counter sits at the row's end.
    await expect(rows[1].querySelector("[aria-hidden=true]")).toHaveTextContent("*");
    const counter = canvas.getByText("12 / 140");
    await expect(Math.round(counter.getBoundingClientRect().right)).toBe(
      Math.round(rows[2].getBoundingClientRect().right),
    );
    await expect(canvas.getByText("Optional")).toHaveClass("text-muted-foreground");
  },
};

const noteTones = [
  { tone: "default", text: "Default: plain supporting copy.", className: "text-foreground" },
  { tone: "muted", text: "Muted: a hint under a field.", className: "text-muted-foreground" },
  { tone: "destructive", text: "Destructive: an error that is not tied to the field.", className: "text-destructive-text" },
  { tone: "warning", text: "Warning: something to double-check.", className: "text-warning" },
] as const;

/** Paper's FormNote tones: default, muted, destructive and warning. */
export const NoteTones: Story = {
  name: "FormNote tones",
  render: () => (
    <div class="flex w-96 flex-col gap-1.5">
      {noteTones.map((note) => (
        <FormNote tone={note.tone}>{note.text}</FormNote>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const note of noteTones) {
      await expect(canvas.getByText(note.text)).toHaveClass(note.className);
    }
  },
};
