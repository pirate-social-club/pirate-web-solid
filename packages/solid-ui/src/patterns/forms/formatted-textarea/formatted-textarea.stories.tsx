import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { boardWidth } from "@/stories/lib/story-measure";
import { FormattedTextarea } from "./formatted-textarea";

function Composer(props: {
  containerClass?: string;
  focusOnMount?: boolean;
  placeholder?: string;
  value?: string;
}) {
  const [value, setValue] = createSignal(props.value ?? "");
  return (
    <FormattedTextarea
      aria-label="Post content"
      class="min-h-28"
      containerClass={props.containerClass ?? "w-[480px] max-w-full"}
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

    const bold = canvas.getByRole("button", { name: "Bold" });
    bold.focus();
    await expect(bold).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(textarea).toHaveValue("****hello****");
  },
};

/** Paper's Empty state: no value, so the placeholder shows. */
export const Empty: Story = {
  render: () => <Composer placeholder="Write a reply..." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;

    await expect(textarea).toHaveAttribute("placeholder", "Write a reply...");
    await expect(textarea).toHaveValue("");
    await expect(textarea.matches(":placeholder-shown")).toBe(true);
  },
};

/** Inserting a link into an empty composer; kept apart so Empty keeps its placeholder. */
export const EmptyLinkInsertion: Story = {
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

/** A 390 phone leaves a 358px content column; the toolbar wraps inside it. */
const phoneComposerClass = "w-[358px] max-w-[calc(100vw-2rem)]";

/** Paper's phone composer: empty with its placeholder, no horizontal overflow. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <Composer containerClass={phoneComposerClass} placeholder="Write a reply..." />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox") as HTMLTextAreaElement;
    await expect(textarea.matches(":placeholder-shown")).toBe(true);
    const container = canvasElement.firstElementChild as HTMLElement;
    await expect(Math.round(container.getBoundingClientRect().width)).toBe(boardWidth(358));
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/** Formatting on a phone; kept apart so Mobile rests on the board state. */
export const MobileInteraction: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <Composer containerClass={phoneComposerClass} />,
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

/** Paper insets the text 16px from the composer's edge, below the toolbar. */
export const TextInset: Story = {
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox");
    const style = getComputedStyle(textarea);
    await expect([style.paddingLeft, style.paddingRight]).toEqual(["16px", "16px"]);
    await expect(style.paddingTop).toBe("12px");
  },
};
