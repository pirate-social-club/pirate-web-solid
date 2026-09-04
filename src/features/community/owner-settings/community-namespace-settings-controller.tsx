import { ApiClientError } from "@pirate/api-client";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";
import { Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { ApiFetch } from "../../../api/proxy";
import { createBobCommunityHnsWallet } from "./community-hns-wallet";
import {
  createCommunityNamespaceSettingsApi,
  type CommunityNamespaceSettingsApiOptions,
} from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { namespaceIdempotencyKeys } from "./community-namespace-idempotency";
import type {
  CommunityNamespaceSettingsPort,
  NamespaceCommandIdempotencyKeys,
  NamespaceSettingsCommand,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

export interface CommunityNamespaceSettingsControllerProps {
  api?: CommunityNamespaceSettingsPort;
  communityId: string;
  communityPath: string;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
}

type LoadStatus = "loading" | "ready" | "denied" | "error";

function operationKeys(): NamespaceCommandIdempotencyKeys {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return namespaceIdempotencyKeys(`hns-address:${random}`);
}

function nextOperationKey(kind: NamespaceSettingsCommand["kind"]): string {
  return operationKeys()[kind];
}

function commandError(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 409) {
    return "The HNS address changed in another request. Refresh the page and try again.";
  }
  if (error instanceof ApiClientError && error.retryable) {
    return "The HNS verifier is temporarily unavailable. Try again in a moment.";
  }
  return "That HNS address step could not be completed.";
}

export function CommunityNamespaceSettingsController(
  props: CommunityNamespaceSettingsControllerProps,
) {
  const api = untrack(() => {
    const apiOptions: CommunityNamespaceSettingsApiOptions = {
      communityId: props.communityId,
      communityPath: props.communityPath,
      ...(props.fetchImpl === undefined ? {} : { fetchImpl: props.fetchImpl }),
      ...(props.origin === undefined ? {} : { origin: props.origin }),
    };
    return props.api ?? createCommunityNamespaceSettingsApi(apiOptions);
  });
  const wallet = createBobCommunityHnsWallet();
  const [status, setStatus] = createSignal<LoadStatus>("loading");
  const [snapshot, setSnapshot] = createSignal<NamespaceSettingsSnapshot>();
  const [draftRootLabel, setDraftRootLabel] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [keys, setKeys] = createSignal(operationKeys());
  let active = true;
  let requestGeneration = 0;

  onCleanup(() => {
    active = false;
    requestGeneration += 1;
  });

  const load = async () => {
    const request = ++requestGeneration;
    setStatus("loading");
    setMessage("");
    try {
      const current = await api.read();
      if (!active || request !== requestGeneration) return;
      setSnapshot(current);
      setDraftRootLabel(current.root_label);
      setStatus("ready");
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) {
        setStatus("denied");
      } else {
        setMessage("Community address settings could not be loaded.");
        setStatus("error");
      }
    }
  };

  createEffect(
    () => props.communityId,
    () => queueMicrotask(() => { if (active) void load(); }),
  );

  const execute = async (command: NamespaceSettingsCommand) => {
    if (busy()) return;
    setBusy(true);
    setMessage("");
    try {
      const current = await api.execute(command);
      if (!active) return;
      setSnapshot(current);
      setDraftRootLabel(current.root_label);
      if (command.kind === "restart" || command.kind === "change_namespace") {
        setKeys(operationKeys());
      } else {
        setKeys((currentKeys) => ({ ...currentKeys, [command.kind]: nextOperationKey(command.kind) }));
      }
    } catch (error) {
      if (active) setMessage(commandError(error));
    } finally {
      if (active) setBusy(false);
    }
  };

  createEffect(
    () => ({ busy: busy(), pollKey: keys().poll, snapshot: snapshot(), status: status() }),
    ({ busy: polling, pollKey, snapshot: current, status: loadStatus }) => {
      if (current?.next_action.kind !== "wait" || polling || loadStatus !== "ready") return;
      const delayMs = Math.min(60, Math.max(1, current.next_action.retry_after_seconds)) * 1_000;
      const timer = setTimeout(() => {
        void execute({
          expected_generation: current.generation,
          idempotency_key: pollKey,
          kind: "poll",
        });
      }, delayMs);
      onCleanup(() => clearTimeout(timer));
    },
  );

  return (
    <Show when={status() !== "loading"} fallback={(
      <Card class="grid min-h-64 place-items-center" role="status">
        <div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading community address…</Type></div>
      </Card>
    )}>
      <Show when={status() !== "denied"} fallback={(
        <Card class="p-6" data-owner-settings-denied>
          <Type as="h2" variant="h2">Owner access required</Type>
          <Type as="p" class="mt-2 text-muted-foreground" variant="body">Community address settings are available only to this community's owner.</Type>
        </Card>
      )}>
        <Show when={status() !== "error"} fallback={(
          <Card class="p-6" role="alert">
            <FormNote tone="destructive">{message()}</FormNote>
            <Button class="mt-4" onClick={() => void load()} variant="secondary">Try again</Button>
          </Card>
        )}>
          <Show when={snapshot()}>{(current) => (
            <>
              <CommunityNamespaceSettingsPanel
                busy={busy()}
                draftRootLabel={draftRootLabel()}
                idempotencyKeys={keys()}
                onCommand={(command) => void execute(command)}
                onDraftRootLabelChange={setDraftRootLabel}
                showHeading={false}
                snapshot={current()}
                wallet={wallet}
              />
              <Show when={message()}><FormNote tone="destructive">{message()}</FormNote></Show>
            </>
          )}</Show>
        </Show>
      </Show>
    </Show>
  );
}
