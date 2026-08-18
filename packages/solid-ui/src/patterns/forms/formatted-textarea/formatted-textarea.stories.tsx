import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { FormattedTextarea } from "./formatted-textarea";

function Composer(props: {
  focusOnMount?: boolean;
  placeholder?: string;
  value?: string;
}) {
  const [value, setValue] = createSignal(props.value ?? "");
  return (
    <FormattedTextarea
      class="min-h-28"
      containerClass="w-[480px] max-w-full"
      focusOnMount={props.focusOnMount}
      onChange={setValue}
      placeholder={props.placeholder}
      value={value()}
    />
  );
}

const meta = {
  title: "Patterns/Forms/FormattedTextarea",
  component: FormattedTextarea,
  tags: ["autodocs"],
  args: {
    value: "",
  },
  argTypes: {
    value: { control: "text" },
    onChange: { table: { disable: true } },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
  render: (args) => <Composer value={args.value} />,
  parameters: {
    docs: {
      description: {
        component:
          "Controlled Textarea with a markdown-lite formatting toolbar. Toolbar buttons wrap the current selection (bold, italic, strikethrough, blockquote, link, bulleted and numbered lists), restore focus, and re-select the inserted text or the link URL. The host owns the value through `value`/`onChange`. Use it for post and comment composers; do not use it as a plain textarea.",
      },
    },
  },
} satisfies Meta<typeof FormattedTextarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;

    await userEvent.type(textarea, "hello");
    await expect(textarea).toHaveValue("hello");

    textarea.focus();
    textarea.setSelectionRange(0, 5);
    await userEvent.click(canvas.getByRole("button", { name: "Bold" }));
    await expect(textarea).toHaveValue("**hello**");
    await waitFor(() => expect(textarea.selectionStart).toBe(2));
    await waitFor(() => expect(textarea.selectionEnd).toBe(7));

    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Bold" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(textarea).toHaveValue("****hello****");
  },
};

export const Empty: Story = {
  render: () => <Composer placeholder="Write a reply..." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;

    await expect(textarea).toHaveAttribute("placeholder", "Write a reply...");
    await expect(textarea).toHaveValue("");

    textarea.focus();
    textarea.setSelectionRange(0, 0);
    await userEvent.click(canvas.getByRole("button", { name: "Link" }));
    await expect(textarea).toHaveValue("[Link text](https://)");
    await waitFor(() => expect(textarea.selectionStart).toBe(12));
  },
};

export const Mobile: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;

    await expect(canvas.getByRole("button", { name: "Bold" })).toBeVisible();
    await userEvent.type(textarea, "first line{Enter}second line");
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    await userEvent.click(canvas.getByRole("button", { name: "Bulleted list" }));
    await expect(textarea).toHaveValue("- first line\n- second line");
  },
};

export const RightToLeft: Story = {
  globals: {
    direction: "rtl",
    locale: "ar",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;

    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(textarea).toHaveAttribute("dir", "auto");
    await expect(canvas.getByRole("button", { name: "Bold" })).toBeVisible();
  },
};
