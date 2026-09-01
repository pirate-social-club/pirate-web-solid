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
import type { ConnectedCommunityName, HnsAddState } from "./owner-settings-model";

export interface CommunityNamespaceSettingsPanelProps {
  connectedName?: ConnectedCommunityName;
  hnsAddState?: HnsAddState;
  onAction?: () => void;
}

function ConnectedNameCard(props: { connectedName: ConnectedCommunityName }) {
  return (
    <Card class="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
      <div class="flex min-w-0 items-start gap-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
          <IconGlobe class="size-5" />
        </div>
        <div class="min-w-0 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <Type as="h3" class="break-all" variant="h3">{props.connectedName.label}</Type>
            <span class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
              <IconCheckCircle class="size-3.5" />
              Connected
            </span>
          </div>
          <Type as="p" class="text-muted-foreground" variant="body">
            Accessible at <a class="underline underline-offset-4" href={props.connectedName.fallbackAddress}>{props.connectedName.fallbackLabel}</a> and <a class="underline underline-offset-4" href={props.connectedName.address}>{props.connectedName.label}</a> with Handshake.
          </Type>
        </div>
      </div>
      <a class={buttonVariants({ variant: "secondary" })} href={props.connectedName.address} rel="noreferrer" target="_blank">
        Open name
      </a>
    </Card>
  );
}

function HnsRecords(props: { onAction?: () => void; state: HnsAddState }) {
  const status = () => {
    switch (props.state.kind) {
      case "checking_records": return { busy: true, message: "Checking records..." };
      case "records_not_found": return { busy: false, message: "Records not found." };
      case "txt_mismatch": return { busy: false, message: "TXT record does not match." };
      case "verifier_unavailable": return { busy: false, message: "Verifier unavailable. Try again." };
      case "expired": return { busy: false, message: "Verification expired. Generate a new challenge." };
      default: return null;
    }
  };
  const primaryLabel = () => {
    switch (props.state.kind) {
      case "records_not_found": return "Check setup";
      case "expired": return "Get a new record list";
      case "txt_mismatch":
      case "verifier_unavailable": return "Check again";
      default: return "Verify";
    }
  };

  return (
    <div class="space-y-4">
      <Card class="space-y-4 p-5 md:p-6">
        <Type as="h2" variant="h2">Add records</Type>
        <Show when={(props.state.nameservers?.length ?? 0) > 0}>
          <div class="space-y-2">
            <Type as="div" variant="caption">NS</Type>
            <For each={props.state.nameservers}>{(value) => <CopyField copyLabel="nameserver" value={value} />}</For>
          </div>
        </Show>
        <Show when={props.state.txtRecord}>
          {(value) => (
            <div class="space-y-2">
              <Type as="div" variant="caption">TXT</Type>
              <CopyField copyLabel="TXT record" value={value()} wrap />
            </div>
          )}
        </Show>
        <Show when={status()}>
          {(current) => (
            <div class="flex items-center gap-2" role={current().busy ? "status" : "alert"}>
              <Show when={current().busy} fallback={<IconWarningCircle class="size-4 text-warning" />}>
                <Spinner size="sm" />
              </Show>
              <Type as="p" class={current().busy ? "text-muted-foreground" : "text-warning"} variant="caption">{current().message}</Type>
            </div>
          )}
        </Show>
      </Card>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={props.onAction} variant="secondary">Use a different namespace</Button>
        <Button loading={props.state.kind === "checking_records"} onClick={props.onAction}>{primaryLabel()}</Button>
      </div>
    </div>
  );
}

function ConnectName(props: { onAction?: () => void; state: HnsAddState }) {
  return (
    <div class="space-y-6">
      <Type as="h2" responsiveSize="desktop4xl" variant="h1">Connect Name</Type>
      <Card class="space-y-5 p-5 md:p-6">
        <div class="space-y-2">
          <FormFieldLabel htmlFor="community-hns-name" label="Handshake root" required />
          <PrefixInput
            class="h-16"
            id="community-hns-name"
            placeholder="infinity"
            prefix="."
            prefixClass="pb-1 text-3xl font-bold"
            value={props.state.rootLabel}
          />
          <FormNote>Route: pirate.sc/c/{props.state.rootLabel}</FormNote>
        </div>
        <Button onClick={props.onAction}>Continue</Button>
      </Card>
    </div>
  );
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <Show when={props.hnsAddState}>
        {(state) => (
          <Show
            when={state().kind === "enter_name"}
            fallback={<HnsRecords onAction={props.onAction} state={state()} />}
          >
            <ConnectName onAction={props.onAction} state={state()} />
          </Show>
        )}
      </Show>
      <Show when={!props.hnsAddState && props.connectedName}>
        <div class="space-y-2">
          <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community address</Type>
        </div>
        <ConnectedNameCard connectedName={props.connectedName!} />
      </Show>
    </section>
  );
}
