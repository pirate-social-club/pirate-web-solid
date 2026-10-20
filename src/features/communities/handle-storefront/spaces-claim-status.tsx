import { ApiClientError, type GetHandleClaimsClaimIdResponse } from "@pirate/api-client";
import { Title } from "@solidjs/meta";
import { Show, createEffect, createMemo, createSignal, onCleanup, sharedConfig } from "solid-js";

import { createSessionHandleSalesClient, type SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { Button, Card, CardContent, CardHeader } from "../../../design-system.ts";
import { SpacesClaimStateCard } from "./spaces-claim-state.tsx";
import { useApplicationSession, useApplicationSessionPending } from "../../shell/application-session.tsx";

type SpacesClaim = Extract<GetHandleClaimsClaimIdResponse, { readonly handle: { readonly family: "spaces" } }>;
type ClaimStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "signed-out" | "not-found" | "error" }
  | { readonly kind: "ready"; readonly claim: SpacesClaim };

function isSpacesClaim(claim: GetHandleClaimsClaimIdResponse): claim is SpacesClaim {
  return claim.fulfillment.kind === "spaces_native_v1" && claim.handle.family === "spaces";
}

export default function SpacesClaimStatus(props: {
  readonly claimId: string;
  readonly communityPath: string;
  readonly client?: Pick<SessionHandleSalesApiClient, "get_handleClaimsClaimId">;
}) {
  const [status, setStatus] = createSignal<ClaimStatus>({ kind: "loading" }, { ownedWrite: true });
  const account = useApplicationSession();
  const pending = useApplicationSessionPending();
  const accountId = () => { const session = account(); return !pending() && typeof session === "object" ? session.userId : undefined; };
  const ready = createMemo(() => {
    const current = status();
    return current.kind === "ready" && accountId() === presentedAccount && current.claim.claim_id === props.claimId ? current.claim : undefined;
  });
  const orderPath = `${props.communityPath.replace(/\/names$/u, "/name-order")}/${encodeURIComponent(props.claimId)}`;
  const signInHref = `/auth/sign-in?return_to=${encodeURIComponent(orderPath)}`;
  let request = 0;
  let presentedAccount: string | undefined;
  let disposed = false;
  let active: AbortController | undefined;
  const refresh = async () => {
    const current = ++request;
    active?.abort();
    const id = accountId();
    const claimId = props.claimId;
    if (disposed || id === undefined) return;
    const controller = new AbortController(); active = controller;
    const alive = () => !disposed && request === current && !controller.signal.aborted && accountId() === id && props.claimId === claimId;
    setStatus({ kind: "loading" });
    try {
      const client = props.client ?? createSessionHandleSalesClient();
      const claim = await client.get_handleClaimsClaimId({ path: { claimId } }, { credentials: "same-origin", signal: controller.signal });
      if (!alive()) return;
      presentedAccount = id;
      if (isSpacesClaim(claim) && claim.claim_id === claimId) setStatus({ kind: "ready", claim });
      else setStatus({ kind: "not-found" });
    } catch (error) {
      if (!alive()) return;
      setStatus({ kind: error instanceof ApiClientError && error.status === 401 ? "signed-out"
        : error instanceof ApiClientError && error.status === 404 ? "not-found" : "error" });
    }
  };
  createEffect(
    () => ({ claimId: props.claimId, account: account(), pending: pending() }),
    ({ account: session }) => {
      request++; active?.abort(); presentedAccount = undefined;
      setStatus({ kind: session === "anonymous" ? "signed-out" : session === "failed" ? "error" : "loading" });
      const expected = request;
      // Keep the server's loading shell intact until its DOM is hydrated.
      const load = () => queueMicrotask(() => { if (!disposed && request === expected) void refresh(); });
      if (sharedConfig.onHydrationEnd) sharedConfig.onHydrationEnd(load);
      else load();
    },
  );
  onCleanup(() => { disposed = true; request++; active?.abort(); });
  return <main class="mx-auto max-w-2xl p-4" data-spaces-claim-order>
    <Title>Spaces name registration</Title>
    <Card>
      <CardHeader><h1 class="text-2xl font-semibold">Spaces name registration</h1></CardHeader>
      <CardContent class="space-y-4">
        <Show when={status().kind === "loading"}><p role="status">Checking your registration…</p></Show>
        <Show when={status().kind === "signed-out"}><div role="alert">
          <p>Sign in to see your registration.</p>
          <a class="underline" href={signInHref}>Sign in</a>
        </div></Show>
        <Show when={status().kind === "not-found"}><p role="alert">This registration is unavailable to your account.</p></Show>
        <Show when={status().kind === "error"}><p role="alert">The registration status could not be loaded. Try again.</p></Show>
        <Show when={ready()}>
          {claim => <SpacesClaimStateCard claim={claim()} />}
        </Show>
        <Button variant="outline" disabled={accountId() === undefined} onClick={() => void refresh()}>Refresh status</Button>
        <a href="/spaces-name-requests" class="underline">All Spaces name requests</a>
        <a href={props.communityPath} class="underline">Back to community names</a>
      </CardContent>
    </Card>
  </main>;
}
