/** @jsxImportSource @solidjs/web */
import { getRequestEvent } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Title } from "@solidjs/meta";

import { createPublicApiClient } from "../../api/client.ts";
import { Spinner, Type } from "../../design-system";
import { MediaShell } from "../shell/media-shell/media-shell.tsx";
import { CommunityPageShell } from "./page-shell/page-shell.tsx";
import {
  communityReviewPage,
  fetchCommunityThreadsPage,
  type CommunityThreadsClient,
  type CommunityThreadsPage,
} from "./community-threads-adapter.ts";

export interface CommunityThreadsPageProps {
  readonly communityRef: string;
  readonly canonicalPath?: string;
  readonly client?: CommunityThreadsClient;
  readonly data?: CommunityThreadsPage;
}

function isLocalCommunityReviewRequest(): boolean {
  const event = getRequestEvent();
  const url = event !== undefined
    ? new URL(event.request.url)
    : typeof location !== "undefined" ? new URL(location.href) : undefined;
  return url !== undefined
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    && url.searchParams.get("fixture") === "community";
}

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function CommunityLoading() {
  return (
    <main aria-busy="true" data-community-state="loading" class="grid min-h-[70vh] place-items-center">
      <div class="flex flex-col items-center gap-3">
        <Spinner label="Loading community" />
        <Type variant="caption">Loading community</Type>
      </div>
    </main>
  );
}

function CommunityError() {
  return (
    <main data-community-state="error" class="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-6 text-center">
      <div>
        <Type as="h1" variant="h1">Community unavailable</Type>
        <Type as="p" variant="body" class="mt-3 text-muted-foreground">This community could not be loaded right now.</Type>
      </div>
    </main>
  );
}

export function CommunityThreadsPage(props: CommunityThreadsPageProps) {
  const reviewFixture = isLocalCommunityReviewRequest();
  const initial = props.data ?? (reviewFixture ? communityReviewPage : undefined);
  const [page, setPage] = createSignal<CommunityThreadsPage | undefined>(initial);
  const [loading, setLoading] = createSignal(initial === undefined);
  const [failed, setFailed] = createSignal(false);

  createEffect(
    () => initial,
    () => {
      if (initial !== undefined || typeof window === "undefined") return;
      let active = true;
      const client = props.client ?? createPublicApiClient({ origin: requestOrigin() });
      void fetchCommunityThreadsPage({ client, communityRef: props.communityRef })
        .then(next => {
          if (!active) return;
          setPage(next);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setFailed(true);
          setLoading(false);
        });
      onCleanup(() => { active = false; });
    },
  );

  createEffect(
    () => props.canonicalPath,
    path => {
      if (typeof window !== "undefined" && path !== undefined && window.location.pathname !== path) {
        window.history.replaceState(window.history.state, "", `${path}${window.location.search}`);
      }
    },
  );

  return (
    <MediaShell activeItemId="communities" signedIn={false}>
      <Show when={!loading()} fallback={<CommunityLoading />}>
        <Show when={!failed() && page()} fallback={<CommunityError />}>
          {(ready) => {
            const current = ready();
            return (
              <>
                <Title>{current.community.name} · Pirate</Title>
                <CommunityPageShell
                  canJoin={current.canJoin}
                  community={current.community}
                  following={current.following}
                  joined={current.joined}
                  onFollowToggle={() => {}}
                  onJoin={() => {}}
                />
              </>
            );
          }}
        </Show>
      </Show>
    </MediaShell>
  );
}
