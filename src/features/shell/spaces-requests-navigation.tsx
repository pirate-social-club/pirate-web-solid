import { getRequestEvent } from "@solidjs/web";
import { createEffect, createSignal, onCleanup, sharedConfig, Show } from "solid-js";
import { Button } from "../../design-system.ts";
import { createSessionSpacesMemberRecoveryClient, type SessionSpacesMemberRecoveryApiClient } from "../../api/handle-sales-client.ts";
import { listSpacesMemberAttempts } from "../communities/handle-storefront/spaces-member-attempt.ts";
import { createSpacesMemberRecovery, type SpacesMemberRecoveryState } from "../communities/handle-storefront/spaces-member-recovery.ts";
import { useApplicationSession, useApplicationSessionPending } from "./application-session.tsx";

/** Presentation only. Registration and transaction admission remain server-owned. */
export function currentSpacesRequestsNavigationEnabled(): boolean {
  const event = getRequestEvent();
  if (event !== undefined) {
    // SAFETY: entry-server writes this request-local key as a boolean only.
    const locals = event.locals as typeof event.locals & { spacesRequestsNavigationEnabled?: boolean };
    return locals.spacesRequestsNavigationEnabled === true;
  }
  return globalThis.window?.document.documentElement.dataset.spacesNameRequests === "enabled";
}

export interface SpacesRequestsNavigationProps {
  readonly navigate: (href: string) => void;
  readonly enabled?: boolean;
  readonly client?: Pick<SessionSpacesMemberRecoveryApiClient, "get_usersMeSpacesHandleRequests">;
}

export function SpacesRequestsNavigation(props: SpacesRequestsNavigationProps) {
  const account = useApplicationSession();
  const pending = useApplicationSessionPending();
  const accountId = () => {
    const current = account();
    return !pending() && typeof current === "object" && current.status === "authenticated" ? current.userId : undefined;
  };
  const [state, setState] = createSignal<SpacesMemberRecoveryState>({ kind: "account-pending", items: [], nextCursor: null, loadingMore: false }, { ownedWrite: true });
  const [localAccount, setLocalAccount] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  let generation = 0;
  let disposed = false;
  const owner = createSpacesMemberRecovery({
    currentAccountId: accountId,
    client: { get_usersMeSpacesHandleRequests: async (args, options) => {
      const deadline = AbortSignal.timeout(4_000);
      const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      let refuse: (reason: unknown) => void = () => {};
      const aborted = new Promise<never>((_resolve, reject) => { refuse = reject; });
      const cancel = () => refuse(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      try {
        signal.throwIfAborted();
        return await Promise.race([
          (props.client ?? createSessionSpacesMemberRecoveryClient()).get_usersMeSpacesHandleRequests(args, { ...options, signal }),
          aborted,
        ]);
      } finally { signal.removeEventListener("abort", cancel); }
    } },
    changed: next => {
      if (next.kind === "signed-out") setLocalAccount(undefined);
      setState(next);
    },
  });
  createEffect(() => ({ account: account(), pending: pending() }), ({ account: session, pending: checking }) => {
    const expected = ++generation;
    const changed = owner.setSession(checking || session === "resolving" || session === undefined ? { kind: "pending" }
      : session === "failed" ? { kind: "failed" } : session === "anonymous" ? { kind: "anonymous" } : { kind: "ready", accountId: session.userId });
    if (changed || accountId() === undefined) setLocalAccount(undefined);
    if (!changed) return;
    const load = () => queueMicrotask(() => {
      const id = accountId();
      if (disposed || generation !== expected || id === undefined || owner.accountId() !== id) return;
      try {
        if (listSpacesMemberAttempts(window.localStorage, id).attempts.length > 0) setLocalAccount(id);
      } catch { /* Unreadable local correlation does not establish a request. */ }
      void owner.refresh();
    });
    if (sharedConfig.onHydrationEnd) sharedConfig.onHydrationEnd(load); else load();
  });
  onCleanup(() => { disposed = true; generation++; owner.dispose(); });
  const visible = () => {
    const id = accountId();
    if (id === undefined || state().kind === "signed-out") return false;
    return (props.enabled ?? currentSpacesRequestsNavigationEnabled())
      || localAccount() === id
      || (owner.accountId() === id && state().items.length > 0);
  };
  return <Show when={visible()}><Button variant="outline" onClick={() => props.navigate("/spaces-name-requests")}>Spaces name requests</Button></Show>;
}
