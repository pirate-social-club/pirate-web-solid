import { For, Show } from "solid-js";

import {
  Button,
  Card,
  CopyField,
  FormFieldLabel,
  FormNote,
  IconCheckCircle,
  IconGlobe,
  IconWarningCircle,
  PrefixInput,
  Spinner,
  Type,
  buttonVariants,
} from "@pirate/web-solid-ui";
import {
  hasUnsupportedNamespaceRecords,
  type NamespaceCommandIdempotencyKeys,
  type NamespaceNextAction,
  type NamespaceResourceRecord,
  type NamespaceSettingsCommand,
  type NamespaceSettingsCommandInput,
  type NamespaceSettingsSnapshot,
} from "./owner-settings-model";

export interface CommunityNamespaceSettingsPanelProps {
  busy?: boolean;
  draftRootLabel: string;
  idempotencyKeys: NamespaceCommandIdempotencyKeys;
  onCommand: (command: NamespaceSettingsCommand) => void;
  onDraftRootLabelChange: (rootLabel: string) => void;
  snapshot: NamespaceSettingsSnapshot;
}

function command(
  idempotencyKeys: NamespaceCommandIdempotencyKeys,
  snapshot: NamespaceSettingsSnapshot,
  value: NamespaceSettingsCommandInput,
): NamespaceSettingsCommand {
  return {
    ...value,
    expected_generation: snapshot.generation,
    idempotency_key: idempotencyKeys[value.kind],
  };
}

function actionTitle(action: NamespaceNextAction): string {
  if (action.kind === "wait") {
    return {
      delegation_insecure: "Waiting for secure delegation",
      provider_unavailable: "Verifier temporarily unavailable",
      tree_commitment_pending: "Waiting for tree commitment",
      verification_pending: "Checking records",
    }[action.reason_code];
  }
  if (action.kind === "repair") {
    return {
      challenge_mismatch: "TXT record does not match",
      delegation_failure: "Delegation is not serving",
      dnssec_failure: "DNSSEC validation failed",
      resource_mismatch: "Published resource does not match",
    }[action.reason_code];
  }
  return action.kind;
}

function NamespaceRecordList(props: { records: ReadonlyArray<NamespaceResourceRecord> }) {
  return (
    <div class="space-y-4">
      <For each={props.records}>
        {(record) => (
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <Type as="div" variant="caption">{record.record_type}</Type>
              <Show when={!record.supported}>
                <span class="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Unsupported</span>
              </Show>
            </div>
            <CopyField class="h-auto min-h-16 py-3" copyLabel={`${record.record_type} record`} value={record.value} wrap />
          </div>
        )}
      </For>
    </div>
  );
}

function ConnectedNameCard(props: { action: Extract<NamespaceNextAction, { kind: "verified" }> }) {
  return (
    <Card class="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6" role="status">
      <div class="flex min-w-0 items-start gap-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
          <IconGlobe class="size-5" />
        </div>
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <Type as="h3" class="break-all" variant="h3">{props.action.canonical_route_label}</Type>
            <span class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
              <IconCheckCircle class="size-3.5" />
              Connected
            </span>
          </div>
          <Type as="p" class="text-muted-foreground" variant="body">
            Accessible at <a class="underline underline-offset-4" href={props.action.fallback_route}>{props.action.fallback_route_label}</a> and <a class="underline underline-offset-4" href={props.action.canonical_route}>{props.action.canonical_route_label}</a> with Handshake.
          </Type>
        </div>
      </div>
      <a class={buttonVariants({ variant: "secondary" })} href={props.action.canonical_route} rel="noreferrer" target="_blank">Open name</a>
    </Card>
  );
}

function SecondaryAction(props: Pick<CommunityNamespaceSettingsPanelProps, "idempotencyKeys" | "onCommand" | "snapshot">) {
  return (
    <Button onClick={() => props.onCommand(command(props.idempotencyKeys, props.snapshot, { kind: "change_namespace" }))} variant="secondary">
      Use a different namespace
    </Button>
  );
}

function publishAction(action: NamespaceNextAction): Extract<NamespaceNextAction, { kind: "publish_resource" }> | null {
  return action.kind === "publish_resource" ? action : null;
}

function waitAction(action: NamespaceNextAction): Extract<NamespaceNextAction, { kind: "wait" }> | null {
  return action.kind === "wait" ? action : null;
}

function repairAction(action: NamespaceNextAction): Extract<NamespaceNextAction, { kind: "repair" }> | null {
  return action.kind === "repair" ? action : null;
}

function verifiedAction(action: NamespaceNextAction): Extract<NamespaceNextAction, { kind: "verified" }> | null {
  return action.kind === "verified" ? action : null;
}

function failedAction(action: NamespaceNextAction): Extract<NamespaceNextAction, { kind: "failed" }> | null {
  return action.kind === "failed" ? action : null;
}

function ServerDirectedAction(props: Pick<CommunityNamespaceSettingsPanelProps, "busy" | "idempotencyKeys" | "onCommand" | "snapshot">) {
  const action = () => props.snapshot.next_action;
  const dispatch = (value: NamespaceSettingsCommandInput) => {
    props.onCommand(command(props.idempotencyKeys, props.snapshot, value));
  };

  return (
    <div class="space-y-4" data-next-action={action().kind}>
      <Show when={action().kind === "start_verification"}>
        <Card class="space-y-4 p-5 md:p-6">
          <Type as="h2" variant="h2">Ready to verify</Type>
          <FormNote>The server will prepare the complete Handshake resource for this name.</FormNote>
          <Button loading={props.busy} onClick={() => dispatch({ kind: "start_verification" })}>Start verification</Button>
        </Card>
        <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
      </Show>

      <Show when={publishAction(action())}>
        {(current) => (
          <>
            <Card class="space-y-5 p-5 md:p-6">
              <Show
                when={!hasUnsupportedNamespaceRecords(current())}
                fallback={
                  <div class="space-y-2" role="alert">
                    <div class="flex items-center gap-2">
                      <IconWarningCircle class="size-5 text-warning" />
                      <Type as="h2" variant="h2">Unsupported records</Type>
                    </div>
                    <FormNote tone="warning">This name contains records that cannot be preserved exactly. Publishing is blocked so existing records are not lost.</FormNote>
                  </div>
                }
              >
                <div class="space-y-2">
                  <Type as="h2" variant="h2">Publish this complete resource</Type>
                  <FormNote tone="warning">A Handshake update replaces the complete resource. Publish every NS, TXT, and DS record below in one wallet update. Publishing only some records can remove records that are already live.</FormNote>
                </div>
              </Show>
              <NamespaceRecordList records={current().records} />
            </Card>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
              <Show when={!hasUnsupportedNamespaceRecords(current())}>
                <Button loading={props.busy} onClick={() => dispatch({ kind: "acknowledge_complete_resource" })}>I published all records, check the chain</Button>
              </Show>
            </div>
          </>
        )}
      </Show>

      <Show when={waitAction(action())}>
        {(current) => (
          <>
            <Card class="space-y-4 p-5 md:p-6" role="status">
              <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h2" variant="h2">{actionTitle(current())}</Type></div>
              <FormNote>
                {current().reason_code === "tree_commitment_pending"
                  ? "Handshake is finalizing the update at the next tree commitment."
                  : current().reason_code === "delegation_insecure"
                    ? "The records match, but secure DNSSEC delegation is not observable yet."
                    : current().reason_code === "provider_unavailable"
                      ? "The verifier is unavailable. Try again after the server-provided interval."
                      : "The server is checking the published records."}
              </FormNote>
              <Type as="p" class="text-muted-foreground" variant="caption">Retry after {current().retry_after_seconds} seconds.</Type>
            </Card>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
              <Button loading={props.busy} onClick={() => dispatch({ kind: "poll" })}>Check status</Button>
            </div>
          </>
        )}
      </Show>

      <Show when={repairAction(action())}>
        {(current) => (
          <>
            <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
              <div class="flex items-center gap-2"><IconWarningCircle class="size-5 text-warning" /><Type as="h2" variant="h2">{actionTitle(current())}</Type></div>
              <FormNote tone="warning">Follow the server response exactly, then check again.</FormNote>
              <Show when={(current().missing_records?.length ?? 0) > 0}>
                <div class="space-y-3"><Type as="h3" variant="h3">Missing records</Type><NamespaceRecordList records={current().missing_records ?? []} /></div>
              </Show>
              <Show when={(current().unexpected_records?.length ?? 0) > 0}>
                <div class="space-y-3"><Type as="h3" variant="h3">Unexpected records</Type><NamespaceRecordList records={current().unexpected_records ?? []} /></div>
              </Show>
            </Card>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
              <Button loading={props.busy} onClick={() => dispatch({ kind: "poll" })}>Check again</Button>
            </div>
          </>
        )}
      </Show>

      <Show when={verifiedAction(action())}>
        {(current) => (
          <div class="space-y-2">
            <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community address</Type>
            <ConnectedNameCard action={current()} />
          </div>
        )}
      </Show>

      <Show when={failedAction(action())}>
        {(current) => (
          <>
            <Card class="space-y-4 border-destructive/40 p-5 md:p-6" role="alert">
              <Type as="h2" variant="h2">Verification failed</Type>
              <FormNote tone="warning">{current().reason_code.replaceAll("_", " ")}</FormNote>
            </Card>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
              <Show when={current().retryable}><Button onClick={() => dispatch({ kind: "restart" })}>Try a new verification</Button></Show>
            </div>
          </>
        )}
      </Show>

      <Show when={action().kind === "expired"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <Type as="h2" variant="h2">Verification expired</Type>
          <FormNote tone="warning">Generate a fresh server challenge before publishing anything.</FormNote>
        </Card>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <SecondaryAction idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />
          <Button onClick={() => dispatch({ kind: "restart" })}>Get a new record list</Button>
        </div>
      </Show>
    </div>
  );
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  const submitNamespace = () => props.onCommand(command(props.idempotencyKeys, props.snapshot, {
    family: "hns",
    kind: "select_namespace",
    root_label: props.draftRootLabel,
  }));

  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <Show when={props.snapshot.next_action.kind === "choose_namespace"} fallback={<ServerDirectedAction busy={props.busy} idempotencyKeys={props.idempotencyKeys} onCommand={props.onCommand} snapshot={props.snapshot} />}>
        <div class="space-y-6">
          <Type as="h2" responsiveSize="desktop4xl" variant="h1">Connect Name</Type>
          <Card class="space-y-5 p-5 md:p-6">
            <div class="space-y-2">
              <FormFieldLabel htmlFor="community-hns-name" label="Handshake root" required />
              <PrefixInput
                class="h-16"
                id="community-hns-name"
                onInput={(event) => props.onDraftRootLabelChange(event.currentTarget.value)}
                placeholder="infinity"
                prefix="."
                prefixClass="pb-1 text-3xl font-bold"
                required
                value={props.draftRootLabel}
              />
              <FormNote>Route: pirate.sc/c/{props.draftRootLabel}</FormNote>
            </div>
            <Button disabled={props.draftRootLabel.trim().length === 0} loading={props.busy} onClick={submitNamespace}>Continue</Button>
          </Card>
        </div>
      </Show>
    </section>
  );
}
