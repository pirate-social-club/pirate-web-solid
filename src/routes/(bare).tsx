import { type JSX } from "solid-js";
import type { RouteSectionProps } from "@solidjs/router";
import { RenderErrorBoundary } from "../lib/render-boundary";

export default function BareLayout(props: RouteSectionProps): JSX.Element {
  return (
    <RenderErrorBoundary fallback={<main><h1>Surface unavailable</h1></main>}>
      <main data-layout="bare">{props.children}</main>
    </RenderErrorBoundary>
  );
}
