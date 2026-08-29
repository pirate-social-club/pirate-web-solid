import type { JSX } from "@solidjs/web";
import { Show, createMemo } from "solid-js";

import { cn } from "@/lib/cn";

export interface ActionFooterShellProps {
  class?: string;
  /** Optional fixed region above the scrolling body. */
  header?: JSX.Element;
  /** The scrolling region. Everything that can grow belongs here. */
  children?: JSX.Element;
  bodyClass?: string;
  /** The pinned action region, typically a submit button or a button row. */
  footer: JSX.Element;
  footerClass?: string;
  /** Fill the viewport instead of the parent. */
  fullViewport?: boolean;
}

/**
 * ActionFooterShell - a header, a scrolling body, and a footer pinned to the
 * bottom of the available height.
 *
 * The footer is a flex sibling of the scrolling region, not a `sticky`
 * element. A `sticky bottom-0` footer placed as the last child of its parent
 * has no sticky range at all, because its containing block ends exactly where
 * it begins: it renders correctly on a tall viewport purely because the
 * content happens to fit, and scrolls away on a short one. This shell pins the
 * footer at every height instead.
 *
 * The shell fills its parent's height, so give it one - a route shell, a sheet
 * body, or `fullViewport` for a standalone surface. Without a bounded height
 * the body cannot scroll and the footer sits after the content, which is the
 * behaviour this component exists to prevent.
 */
export function ActionFooterShell(props: ActionFooterShellProps) {
  // min-h-0 on both the column and the body is what allows the body to shrink
  // below its content height; without it the flex item refuses to scroll and
  // pushes the footer off the bottom.
  const className = createMemo(() =>
    cn(
      "flex min-h-0 flex-col",
      props.fullViewport ? "h-dvh" : "h-full",
      props.class,
    ),
  );
  const bodyClassName = createMemo(() =>
    cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", props.bodyClass),
  );
  const footerClassName = createMemo(() =>
    cn(
      "shrink-0 border-t border-border-soft bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
      props.footerClass,
    ),
  );

  return (
    <div class={className()} data-action-footer-shell>
      <Show when={props.header}>
        <div class="shrink-0" data-action-footer-shell-header>
          {props.header}
        </div>
      </Show>
      <div class={bodyClassName()} data-action-footer-shell-body>
        {props.children}
      </div>
      <div class={footerClassName()} data-action-footer-shell-footer>
        {props.footer}
      </div>
    </div>
  );
}
