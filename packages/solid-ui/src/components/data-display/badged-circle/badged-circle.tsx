import type { JSX } from "@solidjs/web";
import { createMemo, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

export interface BadgedCircleProps {
  badge: JSX.Element;
  badgeFrameClassName?: string;
  /** Accessible label for the badge; enables `role="img"` on the frame. */
  badgeLabel?: string;
  badgeOffsetPercent?: number;
  badgeOffsetXPercent?: number;
  badgeOffsetYPercent?: number;
  badgePadding?: number;
  badgeSize: number;
  class?: string;
}

export function BadgedCircle(props: ParentProps<BadgedCircleProps>) {
  const frameSize = () => props.badgeSize + (props.badgePadding ?? 1) * 2;
  const offsetX = () => props.badgeOffsetXPercent ?? props.badgeOffsetPercent ?? 12;
  const offsetY = () => props.badgeOffsetYPercent ?? props.badgeOffsetPercent ?? 12;

  const className = createMemo(() => cn("relative z-10 inline-flex shrink-0", props.class));
  const frameClassName = createMemo(() =>
    cn(
      "pointer-events-none absolute bottom-0 end-0 z-20 grid place-items-center overflow-hidden rounded-full bg-card",
      props.badgeFrameClassName,
    ),
  );
  const frameStyle = createMemo(() => ({
    height: `${frameSize()}px`,
    padding: `${props.badgePadding ?? 1}px`,
    transform: `translate(${offsetX()}%, ${offsetY()}%)`,
    width: `${frameSize()}px`,
  }));

  return (
    <span class={className()}>
      {props.children}
      <span
        aria-label={props.badgeLabel}
        class={frameClassName()}
        role={props.badgeLabel ? "img" : undefined}
        style={frameStyle()}
        title={props.badgeLabel}
      >
        {props.badge}
      </span>
    </span>
  );
}
