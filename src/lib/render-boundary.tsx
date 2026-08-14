import { createErrorBoundary, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";

export function RenderErrorBoundary(props: ParentProps<{ fallback: JSX.Element }>) {
  return createErrorBoundary(
    () => props.children,
    () => props.fallback,
  )();
}
