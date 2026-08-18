import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

export function Skeleton(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("animate-pulse rounded-md bg-surface-skeleton motion-reduce:animate-none", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}
