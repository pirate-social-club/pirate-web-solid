import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { FormattedTextarea } from "./formatted-textarea";
import { expectNoA11yViolations, render } from "@/test/test-utils";

function Composer(props: {
  disabled?: boolean;
  focusOnMount?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
  toolbarLabels?: { bold?: string; link?: string };
  value?: string;
}) {
  const [value, setValue] = createSignal(props.value ?? "");
  return (
    <FormattedTextarea
      disabled={props.disabled}
      focusOnMount={props.focusOnMount}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      placeholder={props.placeholder}
      toolbarLabels={props.toolbarLabels}
      value={value()}
    />
  );
}

describe("FormattedTextarea", () => {
  it("renders the toolbar and a controlled textarea", () => {
    const container = render(() => <Composer placeholder="Write a reply..." value="seed" />);

    const textarea = within(container).getByRole("textbox");
    expect(textarea).toHaveValue("seed");
    expect(textarea).toHaveAttribute("placeholder", "Write a reply...");

    for (const name of [
      "Bold",
      "Italic",
      "Strikethrough",
      "Blockquote",
      "Link",
      "Bulleted list",
      "Numbered list",
    ]) {
      expect(within(container).getByRole("button", { name })).toBeVisible();
    }
  });

  it("uses host-provided localized toolbar labels", () => {
    const container = render(() => (
      <Composer toolbarLabels={{ bold: "Gras", link: "Lien" }} />
    ));

    expect(within(container).getByRole("button", { name: "Gras" })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Lien" })).toBeVisible();
    expect(within(container).getByRole("button", { name: "Italic" })).toBeVisible();
  });

  it("wraps the current selection with bold tokens and reports onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => <Composer onChange={onChange} value="hello" />);

    const textarea = within(container).getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 5);

    await user.click(within(container).getByRole("button", { name: "Bold" }));
    flush();

    expect(onChange).toHaveBeenCalledWith("**hello**");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(7);
  });

  it("inserts a link around the selection and selects the URL", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => <Composer onChange={onChange} value="read docs" />);

    const textarea = within(container).getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(5, 9);

    await user.click(within(container).getByRole("button", { name: "Link" }));
    flush();

    expect(onChange).toHaveBeenCalledWith("read [docs](https://)");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(textarea.selectionStart).toBe(12);
    expect(textarea.selectionEnd).toBe(20);
  });

  it("prefixes the selected block with list markers", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => (
      <Composer onChange={onChange} value={"one\ntwo"} />
    ));

    const textarea = within(container).getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 7);

    await user.click(within(container).getByRole("button", { name: "Bulleted list" }));
    flush();
    expect(onChange).toHaveBeenCalledWith("- one\n- two");

    await new Promise((resolve) => setTimeout(resolve, 30));
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
    await user.click(within(container).getByRole("button", { name: "Numbered list" }));
    flush();
    expect(onChange).toHaveBeenLastCalledWith("1. - one\n2. - two");
  });

  it("quotes the current line with a fallback", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => <Composer onChange={onChange} value="" />);

    const textarea = within(container).getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    await user.click(within(container).getByRole("button", { name: "Blockquote" }));
    flush();
    expect(onChange).toHaveBeenCalledWith("> Quoted text");
  });

  it("emits the raw text on typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const container = render(() => <Composer onChange={onChange} />);

    await user.type(within(container).getByRole("textbox"), "abc");
    flush();
    expect(onChange).toHaveBeenLastCalledWith("abc");
  });

  it("focuses the textarea when focusOnMount is set", () => {
    const container = render(() => <Composer focusOnMount />);

    expect(within(container).getByRole("textbox")).toHaveFocus();
  });

  it("disables the toolbar with the textarea", () => {
    const container = render(() => <Composer disabled value="locked" />);

    expect(within(container).getByRole("textbox")).toBeDisabled();
    expect(within(container).getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(within(container).getByRole("button", { name: "Link" })).toBeDisabled();
  });

  it("has no axe violations", async () => {
    render(() => <Composer placeholder="Write a reply..." />);

    await expectNoA11yViolations();
  });
});
