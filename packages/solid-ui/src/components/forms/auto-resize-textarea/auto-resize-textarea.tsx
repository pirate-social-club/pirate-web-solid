import type { JSX } from "@solidjs/web";
import { createMemo, omit, onSettled } from "solid-js";

import { Textarea, type TextareaProps } from "@/components/forms/textarea/textarea";
import { cn } from "@/lib/cn";

export interface AutoResizeTextareaProps
  extends TextareaProps {
  /** Maximum number of visible rows before scrolling. Defaults to 5. */
  maxRows?: number;
}

/**
 * AutoResizeTextarea - a textarea that grows with its content up to maxRows.
 * Height is computed from the element's computed line height and paddings;
 * the textarea still scrolls once the content exceeds the cap.
 */
export function AutoResizeTextarea(props: AutoResizeTextareaProps) {
  let textareaRef: HTMLTextAreaElement | undefined;

  const resize = () => {
    const textarea = textareaRef;
    if (!textarea) return;

    const maxRows = props.maxRows ?? 5;

    textarea.style.height = "auto";
    const computedStyle = getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;

    const maxScrollHeight = maxRows * lineHeight + paddingTop + paddingBottom;
    const nextScrollHeight = Math.min(textarea.scrollHeight, maxScrollHeight);

    textarea.style.height = `${nextScrollHeight + borderTop + borderBottom}px`;
  };

  onSettled(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  });

  const rest = omit(props, "class", "maxRows", "ref", "onInput", "rows");
  const className = createMemo(() => cn("min-h-0 resize-none", props.class));

  return (
    <Textarea
      {...rest}
      class={className()}
      rows={props.rows ?? 1}
      ref={(el) => {
        textareaRef = el;
        (props.ref as ((el: HTMLTextAreaElement) => void) | undefined)?.(el);
      }}
      onInput={(event) => {
        resize();
        (props.onInput as ((event: InputEvent) => void) | undefined)?.(event);
      }}
    />
  );
}
