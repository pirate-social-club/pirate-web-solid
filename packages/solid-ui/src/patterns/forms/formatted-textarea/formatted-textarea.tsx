import type { JSX } from "@solidjs/web";
import { For, createMemo, omit, onSettled } from "solid-js";

import { Textarea } from "@/components/forms/textarea/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/overlays/tooltip/tooltip";
import { cn } from "@/lib/cn";
import {
  IconLinkSimple,
  IconListBullets,
  IconListNumbers,
  IconQuote,
} from "./toolbar-icons";

export type FormattedTextareaToolbarAction =
  | "bold"
  | "italic"
  | "strike"
  | "quote"
  | "link"
  | "bulletList"
  | "orderedList";

export type FormattedTextareaToolbarLabels = Partial<
  Readonly<Record<FormattedTextareaToolbarAction, string>>
>;

const toolbar: Array<{
  action: FormattedTextareaToolbarAction;
  label: () => JSX.Element;
  title: string;
}> = [
  { action: "bold", label: () => "B", title: "Bold" },
  { action: "italic", label: () => "I", title: "Italic" },
  { action: "strike", label: () => "S", title: "Strikethrough" },
  { action: "quote", label: () => <IconQuote class="size-5" />, title: "Blockquote" },
  { action: "link", label: () => <IconLinkSimple class="size-5" />, title: "Link" },
  { action: "bulletList", label: () => <IconListBullets class="size-5" />, title: "Bulleted list" },
  { action: "orderedList", label: () => <IconListNumbers class="size-5" />, title: "Numbered list" },
];

const toolbarButtonClass =
  "inline-flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-full border border-transparent px-3 text-base font-semibold text-muted-foreground transition-colors motion-reduce:transition-none hover:border-border-soft hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

export interface FormattedTextareaProps
  extends Omit<
    JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "class" | "onChange" | "onInput" | "value"
  > {
  class?: string;
  containerClass?: string;
  /** Focus the textarea when the pattern mounts. */
  focusOnMount?: boolean;
  /** Called with the next string value after typing or a toolbar action. */
  onChange?: (value: string) => void;
  /** Optional localized accessible names and tooltips for toolbar actions. */
  toolbarLabels?: FormattedTextareaToolbarLabels;
  value: string;
}

/**
 * FormattedTextarea - a controlled Textarea with a formatting toolbar that
 * inserts markdown-lite tokens around the current selection (bold, italic,
 * strikethrough, blockquote, link, bulleted and numbered lists) and previews
 * nothing. Toolbar buttons carry accessible names and tooltips. The host owns
 * the value; use it for post and comment composers backed by a local store.
 */
export function FormattedTextarea(props: FormattedTextareaProps) {
  const className = createMemo(() =>
    cn("min-h-32", props.class),
  );
  const containerClassName = createMemo(() =>
    cn(
      "overflow-hidden rounded-xl border border-input bg-background shadow-sm",
      props.containerClass,
    ),
  );
  const rest = omit(
    props,
    "class",
    "containerClass",
    "focusOnMount",
    "onChange",
    "toolbarLabels",
    "value",
  );

  let textareaRef: HTMLTextAreaElement | undefined;

  const emitInput = (event: Event & { currentTarget: HTMLTextAreaElement }) => {
    props.onChange?.(event.currentTarget.value);
  };

  onSettled(() => {
    if (props.focusOnMount) {
      textareaRef?.focus();
    }
  });

  const updateSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const applyWrap = (token: string, fallbackText: string) => {
    const textarea = textareaRef;
    if (!textarea) return;
    const start = textarea.selectionStart ?? props.value.length;
    const end = textarea.selectionEnd ?? props.value.length;
    const selectedText = props.value.slice(start, end);
    const insertedText = `${token}${selectedText || fallbackText}${token}`;
    const nextValue = `${props.value.slice(0, start)}${insertedText}${props.value.slice(end)}`;
    props.onChange?.(nextValue);
    const cursorStart = start + token.length;
    const cursorEnd = cursorStart + (selectedText || fallbackText).length;
    updateSelection(cursorStart, cursorEnd);
  };

  const applyLinePrefix = (
    getPrefix: (index: number) => string,
    fallbackText: string,
  ) => {
    const textarea = textareaRef;
    if (!textarea) return;
    const start = textarea.selectionStart ?? props.value.length;
    const end = textarea.selectionEnd ?? props.value.length;
    const lineStart = props.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLineBreak = props.value.indexOf("\n", end);
    const lineEnd = nextLineBreak === -1 ? props.value.length : nextLineBreak;
    const selectedBlock = props.value.slice(lineStart, lineEnd);
    const lines = selectedBlock.split("\n");
    const prefixedBlock = lines
      .map((line, index) => `${getPrefix(index)}${line || fallbackText}`)
      .join("\n");
    const nextValue = `${props.value.slice(0, lineStart)}${prefixedBlock}${props.value.slice(lineEnd)}`;
    props.onChange?.(nextValue);
    updateSelection(lineStart, lineStart + prefixedBlock.length);
  };

  const applyLink = () => {
    const textarea = textareaRef;
    if (!textarea) return;
    const start = textarea.selectionStart ?? props.value.length;
    const end = textarea.selectionEnd ?? props.value.length;
    const selectedText = props.value.slice(start, end) || "Link text";
    const insertedText = `[${selectedText}](https://)`;
    const nextValue = `${props.value.slice(0, start)}${insertedText}${props.value.slice(end)}`;
    props.onChange?.(nextValue);
    const urlStart = start + selectedText.length + 3;
    const urlEnd = urlStart + "https://".length;
    updateSelection(urlStart, urlEnd);
  };

  const handleToolbarAction = (action: FormattedTextareaToolbarAction) => {
    switch (action) {
      case "bold":
        applyWrap("**", "bold text");
        return;
      case "italic":
        applyWrap("*", "italic text");
        return;
      case "strike":
        applyWrap("~~", "struck text");
        return;
      case "quote":
        applyLinePrefix(() => "> ", "Quoted text");
        return;
      case "link":
        applyLink();
        return;
      case "bulletList":
        applyLinePrefix(() => "- ", "List item");
        return;
      case "orderedList":
        applyLinePrefix((index) => `${index + 1}. `, "List item");
        return;
    }
  };

  return (
    <div class={containerClassName()}>
      <div class="flex flex-wrap items-center gap-2 border-b border-border-soft p-3">
        <For each={toolbar}>
          {(item) => {
            const title = () => props.toolbarLabels?.[item.action] ?? item.title;
            return (
              <Tooltip openDelay={100}>
                <TooltipTrigger
                  aria-label={title()}
                  class={toolbarButtonClass}
                  disabled={props.disabled}
                  onClick={() => handleToolbarAction(item.action)}
                >
                  {item.label()}
                </TooltipTrigger>
                <TooltipContent>{title()}</TooltipContent>
              </Tooltip>
            );
          }}
        </For>
      </div>
      <Textarea
        {...rest}
        class={className()}
        onInput={emitInput}
        ref={(element) => {
          textareaRef = element;
        }}
        value={props.value}
        variant="flat"
      />
    </div>
  );
}
