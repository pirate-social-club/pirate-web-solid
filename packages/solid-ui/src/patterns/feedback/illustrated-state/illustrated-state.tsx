import type { JSX } from "@solidjs/web";
import { createMemo, Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

export interface IllustratedStateImage {
  alt: string;
  src: string;
  srcSet: string;
}

export interface IllustratedStateProps {
  title?: string;
  description?: string;
  action?: JSX.Element;
  class?: string;
  /** Rendered inside a `<picture>` with a webp `source` and a fallback `img`. */
  image: IllustratedStateImage;
}

/**
 * IllustratedState - a centered empty, error, or success placeholder with a
 * circular mascot image, a muted title, an optional description, and an
 * optional recovery action. Use it when a whole view has no content; do not
 * use it inside dense forms or lists.
 */
export function IllustratedState(props: IllustratedStateProps) {
  const className = createMemo(() =>
    cn(
      "flex flex-col items-center justify-center gap-5 px-5 py-10 text-center",
      props.class,
    ),
  );

  return (
    <div class={className()}>
      <div class="relative size-32 overflow-hidden rounded-full md:size-40">
        <picture>
          <source srcset={props.image.srcSet} type="image/webp" />
          <img
            alt={props.image.alt}
            class="size-full object-cover"
            draggable={false}
            src={props.image.src}
          />
        </picture>
      </div>
      <Show when={props.title}>
        {(title) => (
          <Type as="p" class="m-0 text-muted-foreground" variant="h4">
            {title()}
          </Type>
        )}
      </Show>
      <Show when={props.description}>
        {(description) => (
          <Type as="p" class="m-0 max-w-xs text-muted-foreground" variant="body">
            {description()}
          </Type>
        )}
      </Show>
      <Show when={props.action}>
        {(action) => <div class="mt-1">{action()}</div>}
      </Show>
    </div>
  );
}
