import { type JSX } from "solid-js";
import type { RouteSectionProps } from "@solidjs/router";
import { RenderErrorBoundary } from "../../lib/render-boundary";

export default function CommunityLayout(props: RouteSectionProps): JSX.Element {
  return (
    <RenderErrorBoundary fallback={<main><h1>Community unavailable</h1></main>}>
      <section data-layout="community">
        <p>Community surface</p>
        {props.children}
      </section>
    </RenderErrorBoundary>
  );
}
