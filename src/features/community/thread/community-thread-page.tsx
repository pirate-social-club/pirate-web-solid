/** @jsxImportSource @solidjs/web */
import { getRequestEvent } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Title } from "@solidjs/meta";

import { createPublicApiClient } from "../../../api/client.ts";
import { Spinner, Type } from "../../../design-system";
import { MediaShell } from "../../shell/media-shell/media-shell.tsx";
import { communityThreadReviewPage } from "./community-thread-fixtures.ts";
import { fetchCommunityThread, type CommunityThreadClient } from "./community-thread-adapter.ts";
import { CommunityThreadView } from "./community-thread-view.tsx";
import type { CommunityThread } from "./community-thread-model.ts";

export interface CommunityThreadPageProps {
  readonly postId: string;
  readonly client?: CommunityThreadClient;
  readonly data?: CommunityThread;
}

function isLocalThreadReviewRequest(): boolean {
  const event = getRequestEvent();
  const url = event !== undefined
    ? new URL(event.request.url)
    : typeof location !== "undefined" ? new URL(location.href) : undefined;
  return url !== undefined
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    && url.searchParams.get("fixture") === "thread";
}

function ThreadLoading() {
  return (
    <main aria-busy="true" data-community-thread-state="loading" class="grid min-h-[70vh] place-items-center">
      <div class="flex flex-col items-center gap-3">
        <Spinner label="Loading thread" />
        <Type variant="caption">Loading thread</Type>
      </div>
    </main>
  );
}

function ThreadError() {
  return (
    <main data-community-thread-state="error" class="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-6 text-center">
      <div>
        <Type as="h1" variant="h1">Thread unavailable</Type>
        <Type as="p" variant="body" class="mt-3 text-muted-foreground">This thread could not be loaded right now.</Type>
      </div>
    </main>
  );
}

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

export function CommunityThreadPage(props: CommunityThreadPageProps) {
  const reviewFixture = isLocalThreadReviewRequest();
  const initial = props.data ?? (reviewFixture ? communityThreadReviewPage : undefined);
  const [thread, setThread] = createSignal<CommunityThread | undefined>(initial);
  const [loading, setLoading] = createSignal(initial === undefined);
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    if (initial !== undefined || typeof window === "undefined") return;
    let active = true;
    const client = props.client ?? createPublicApiClient({ origin: requestOrigin() });
    void fetchCommunityThread({ client, postId: props.postId })
      .then(next => {
        if (!active) return;
        setThread(next);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    onCleanup(() => { active = false; });
  });

  return (
    <MediaShell activeItemId="communities" signedIn={false}>
      <Show when={!loading()} fallback={<ThreadLoading />}>
        <Show when={!failed() && thread()} fallback={<ThreadError />}>
          {(ready) => (
            <>
              <Title>{ready().post.title} · Pirate</Title>
              <CommunityThreadView thread={ready()} />
            </>
          )}
        </Show>
      </Show>
    </MediaShell>
  );
}
