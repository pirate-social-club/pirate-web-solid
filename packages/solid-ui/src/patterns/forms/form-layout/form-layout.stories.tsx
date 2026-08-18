import type { Meta, StoryObj } from "storybook-solidjs-vite";

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
