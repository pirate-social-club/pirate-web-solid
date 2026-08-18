import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";
import logoUrl from "./logo_ghost_sm.png";

export interface PirateBrandMarkProps
  extends Omit<JSX.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Hide the mark from assistive technology; the surrounding text must name the brand. */
  decorative?: boolean;
}

/**
 * PirateBrandMark - the product logo mark. Decorative by default (empty
 * `alt`, `aria-hidden`) because callers always pair it with visible brand
 * text; set `decorative={false}` when the mark itself must carry the brand
 * name. Use it in app chrome and brand panels, not inline in running copy.
 */
export function PirateBrandMark(props: PirateBrandMarkProps) {
  const className = createMemo(() =>
    cn("size-10 object-contain", props.class),
  );
  const decorative = createMemo(() => props.decorative ?? true);
  const alt = createMemo(() =>
    decorative() ? "" : props.alt ?? "Pirate",
  );
  const rest = omit(props, "class", "decorative", "alt", "aria-hidden");

  return (
    <img
      {...rest}
      alt={alt()}
      aria-hidden={decorative() ? "true" : undefined}
      class={className()}
      decoding="async"
      draggable={false}
      loading="eager"
      src={logoUrl}
    />
  );
}
