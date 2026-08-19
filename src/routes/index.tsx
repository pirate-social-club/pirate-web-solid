import { Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { resolveSession, type SessionResolution } from "../api/session.ts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "../design-system";
import HomeFeed, { type HomeFeedProps } from "../features/posts/feed/home-feed.tsx";
import PublicFeed, { type PublicFeedProps } from "../features/posts/feed/public-feed.tsx";

export interface HomeRouteProps {
  /** Test seam; production resolves the host-only api-next session cookie. */
  readonly resolveSession?: () => Promise<SessionResolution>;
  readonly publicData?: PublicFeedProps["data"];
  readonly publicClient?: PublicFeedProps["client"];
  readonly homeData?: HomeFeedProps["data"];
  readonly homeClient?: HomeFeedProps["client"];
}

type HomeRouteSession = "resolving" | SessionResolution;

function isHydrationFixtureRequest(): boolean {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).searchParams.get("hydration") === "1";
  return typeof location !== "undefined" && new URL(location.href).searchParams.get("hydration") === "1";
}

function HydrationFixtures() {
  const [count, setCount] = createSignal(0);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [displayName, setDisplayName] = createSignal("");

  return (
    <aside data-hydration-fixtures>
      <Title>Pirate Web</Title>
      <h1>Pirate Web Solid shell</h1>
      <p>A standalone Solid runtime is ready for future product lanes.</p>
      <Button id="hydration-button" type="button" onClick={() => setCount(value => value + 1)}>
        hydration-count: {count()}
      </Button>
      <section id="hydration-dialog-fixture" aria-label="Overlay hydration fixture">
        <Dialog open={dialogOpen()} onOpenChange={setDialogOpen}>
          <DialogTrigger id="hydration-dialog-open" type="button">
            Open hydration dialog
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Hydration dialog</DialogTitle>
              <DialogDescription>Internal solid-ui overlays hydrate in the direct Worker shell.</DialogDescription>
            </DialogHeader>
            <p id="hydration-dialog-marker">portal-ready</p>
          </DialogContent>
        </Dialog>
      </section>
      <section id="hydration-form-fixture" aria-label="Form hydration fixture">
        <TextField name="display-name" value={displayName()} onChange={setDisplayName}>
          <TextFieldLabel>Display name</TextFieldLabel>
          <TextFieldInput id="hydration-display-name" />
          <TextFieldDescription id="hydration-display-name-description">
            Controlled form values stay connected after hydration.
          </TextFieldDescription>
        </TextField>
      </section>
    </aside>
  );
}

/**
 * Public-first home route: discovery is visible immediately, then an
 * authenticated session upgrades the surface to the signed-in home feed.
 * Session failures stay on the public surface so auth infrastructure cannot
 * turn anonymous discovery into a blank or blocked home page.
 */
export default function HomeRoute(props: HomeRouteProps = {}) {
  const [session, setSession] = createSignal<HomeRouteSession>("resolving");
  const hydrationFixtures = isHydrationFixtureRequest();

  createEffect(
    () => true,
    () => {
      let active = true;
      void (props.resolveSession ?? resolveSession)()
        .then(result => {
          if (active) setSession(result);
        })
        .catch(() => {
          if (active) setSession("anonymous");
        });
      onCleanup(() => { active = false; });
    },
  );

  return (
    <div data-route-path="/" data-home-session={session()}>
      <Show
        when={session() === "authenticated"}
        fallback={<PublicFeed client={props.publicClient} data={props.publicData} />}
      >
        <HomeFeed client={props.homeClient} data={props.homeData} />
      </Show>
      <Show when={hydrationFixtures}>
        <HydrationFixtures />
      </Show>
    </div>
  );
}
