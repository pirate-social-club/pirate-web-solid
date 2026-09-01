import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { ApiClientError } from "@pirate/api-client-happy-path";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";

import {
  createCommunityNamesSettingsApi,
  type CommunityNamesSettingsApi,
} from "./community-names-settings-api";
import {
  broadNamesOfferingInput,
  namesOfferingRevisionInput,
  saleNamespaceActivationInput,
  saleNamespaceRevisionInput,
  type CommunityNamesManagementSnapshot,
  type CommunityNamesSettingsCommand,
} from "./community-names-settings-model";
import { CommunityNamesSettingsPanel } from "./community-names-settings-panel";

export interface CommunityNamesSettingsControllerProps {
  api?: CommunityNamesSettingsApi;
  communityId: string;
  onReviewAddress?: () => void;
}

type LoadStatus = "loading" | "ready" | "denied" | "error";

function idempotencyKey(scope: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `community-names:${scope}:${random}`;
}

function safeCommandError(error: ApiClientError | undefined): string {
  if (error?.status === 409) return "Community Names changed. Refresh the settings before trying again.";
  return "That Community Names change could not be completed.";
}

export function CommunityNamesSettingsController(
  props: CommunityNamesSettingsControllerProps,
) {
  const api = props.api ?? createCommunityNamesSettingsApi();
  const [status, setStatus] = createSignal<LoadStatus>("loading");
  const [message, setMessage] = createSignal("");
  const [snapshot, setSnapshot] = createSignal<CommunityNamesManagementSnapshot>();
  const [busy, setBusy] = createSignal<CommunityNamesSettingsCommand["kind"]>();
  const commandKeys = new Map<string, string>();
  let active = true;
  let requestGeneration = 0;

  onCleanup(() => {
    active = false;
    requestGeneration += 1;
  });

  const commandKey = (scope: string): string => {
    const existing = commandKeys.get(scope);
    if (existing !== undefined) return existing;
    const created = idempotencyKey(scope);
    commandKeys.set(scope, created);
    return created;
  };

  const load = async () => {
    const request = ++requestGeneration;
    setStatus("loading");
    setMessage("");
    try {
      const nextSnapshot = await api.getSnapshot({ communityId: props.communityId });
      if (!active || request !== requestGeneration) return;
      setSnapshot(nextSnapshot);
      setStatus("ready");
    } catch (error) {
      if (!active || request !== requestGeneration) return;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 404)) {
        setStatus("denied");
        return;
      }
      setMessage("Community Names settings could not be loaded.");
      setStatus("error");
    }
  };

  createEffect(
    () => props.communityId,
    () => { queueMicrotask(() => { if (active) void load(); }); },
  );

  const execute = async (command: CommunityNamesSettingsCommand) => {
    const current = snapshot();
    if (current === undefined || busy() !== undefined) return;
    setBusy(command.kind);
    setMessage("");
    try {
      if (command.kind === "enable_names") {
        const existing = current.saleNamespaces.find((item) => (
          item.activation.canonical_root === command.candidate.canonical_root
        ));
        const activation = existing?.activation ?? await api.activateSaleNamespace(saleNamespaceActivationInput({
          candidate: command.candidate,
          communityId: props.communityId,
          idempotencyKey: commandKey(`activate:${command.candidate.canonical_root}:${command.candidate.expected_namespace_authority_generation}:${command.candidate.expected_dns_zone_activation_generation}`),
        }));
        if (activation.status !== "active") {
          await load();
          return;
        }
        await api.createOffering(broadNamesOfferingInput({
          activation,
          context: current.context,
          idempotencyKey: commandKey(`offer:${activation.sale_namespace_activation_id}:${activation.sale_namespace_activation_generation}`),
        }));
      } else if (command.kind === "resume_name_hosting") {
        await api.reviseSaleNamespace(saleNamespaceRevisionInput({
          activation: command.activation,
          communityId: props.communityId,
          idempotencyKey: commandKey(`namespace:${command.activation.sale_namespace_activation_id}:${command.activation.sale_namespace_activation_hash}:active`),
          status: "active",
        }));
      } else {
        const requestedStatus = command.kind === "pause_names" ? "paused" : "active";
        await api.reviseOffering(namesOfferingRevisionInput({
          communityId: props.communityId,
          idempotencyKey: commandKey(`offering:${command.offering.offering_id}:${command.offering.offering_hash}:${requestedStatus}`),
          offering: command.offering,
          status: requestedStatus,
        }));
      }
      if (active) await load();
    } catch (error) {
      if (active) setMessage(safeCommandError(error instanceof ApiClientError ? error : undefined));
    } finally {
      if (active) setBusy(undefined);
    }
  };

  return (
    <Show when={status() !== "loading"} fallback={(
      <Card class="grid min-h-64 place-items-center" role="status">
        <div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading Community Names…</Type></div>
      </Card>
    )}>
      <Show when={status() !== "denied"} fallback={(
        <Card class="p-6" data-owner-settings-denied>
          <Type as="h2" variant="h2">Owner access required</Type>
          <Type as="p" class="mt-2 text-muted-foreground" variant="body">Community Names settings are available only to this community's owner.</Type>
        </Card>
      )}>
        <Show when={status() !== "error"} fallback={(
          <Card class="p-6" role="alert">
            <FormNote tone="destructive">{message()}</FormNote>
            <Button class="mt-4" onClick={() => void load()} variant="secondary">Try again</Button>
          </Card>
        )}>
          <Show when={snapshot()}>{(current) => (
            <CommunityNamesSettingsPanel
              busy={busy()}
              errorMessage={message() || undefined}
              onCommand={(command) => void execute(command)}
              onReviewAddress={props.onReviewAddress}
              showHeading={false}
              snapshot={current()}
            />
          )}</Show>
        </Show>
      </Show>
    </Show>
  );
}
