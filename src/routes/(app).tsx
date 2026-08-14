import { type JSX } from "solid-js";
import type { RouteSectionProps } from "@solidjs/router";
import { useHostContext } from "../lib/host-context";
import { RenderErrorBoundary } from "../lib/render-boundary";

export default function AppShellLayout(props: RouteSectionProps): JSX.Element {
  const host = useHostContext();
  return (
    <RenderErrorBoundary fallback={<main><h1>App shell unavailable</h1></main>}>
      <div data-layout="app-shell">
        <header>
          <a href="/" aria-label="Pirate home">Pirate Web</a>
          <span data-layout-surface={host.surface}>{host.communitySlug ?? "canonical"}</span>
          <nav aria-label="Primary navigation">
            <a href="/">Home</a>
            <a href="/c/demo/threads">Community</a>
            <a href="/settings">Settings</a>
          </nav>
        </header>
        {props.children}
      </div>
    </RenderErrorBoundary>
  );
}
