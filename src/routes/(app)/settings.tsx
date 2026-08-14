import { type JSX } from "solid-js";
import type { RouteSectionProps } from "@solidjs/router";
import { RequireSession } from "../../lib/auth/require-session";
import { RenderErrorBoundary } from "../../lib/render-boundary";

export default function SettingsLayout(props: RouteSectionProps): JSX.Element {
  return (
    <RequireSession>
      <RenderErrorBoundary fallback={<main><h1>Settings unavailable</h1></main>}>
        <section data-layout="settings">
          <h1>Settings</h1>
          <nav aria-label="Settings navigation"><a href="/settings/profile">Profile</a></nav>
          {props.children}
        </section>
      </RenderErrorBoundary>
    </RequireSession>
  );
}
