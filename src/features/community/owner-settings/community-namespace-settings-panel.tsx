import { Show } from "solid-js";

import {
  Button,
  Card,
  FormFieldLabel,
  FormNote,
  IconCheckCircle,
  IconGlobe,
  IconWarningCircle,
  Input,
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
          <Type as="p" class="text-muted-foreground" variant="body">{props.connectedName.providerLabel}</Type>
        </div>
      </div>
      <a class={buttonVariants({ variant: "secondary" })} href={props.connectedName.address} rel="noreferrer" target="_blank">
        Open name
      </a>
    </Card>
  );
}

function HnsStepLabel(props: { step: number }) {
  return <Type as="p" class="text-muted-foreground" variant="caption">Step {props.step} of 4</Type>;
}

function HnsAddStateCard(props: { onAction?: () => void; state: HnsAddState }) {
  const name = () => `${props.state.rootLabel}/`;

  return (
    <Show
      when={props.state.kind !== "enter_name"}
      fallback={
        <Card class="space-y-5 p-5 md:p-6">
          <HnsStepLabel step={1} />
          <div class="space-y-2">
            <Type as="h3" variant="h3">Add a Handshake name</Type>
            <FormNote>Enter the name you own. You will confirm the connection in your wallet next.</FormNote>
          </div>
          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-hns-name" label="Handshake name" required />
            <div class="flex items-center gap-2">
              <Input id="community-hns-name" value={props.state.rootLabel} />
              <span class="text-lg text-muted-foreground">/</span>
            </div>
          </div>
          <Button onClick={props.onAction}>Continue</Button>
        </Card>
      }
    >
      <Show when={props.state.kind === "wallet_action"}>
        <Card class="space-y-5 p-5 md:p-6">
          <HnsStepLabel step={2} />
          <div class="space-y-2">
            <Type as="h3" variant="h3">Update {name()} in your wallet</Type>
            <FormNote>Pirate has prepared the connection settings. Open your wallet, review the update and publish it.</FormNote>
          </div>
          <FormNote tone="warning">This changes the name’s DNS settings. Confirm that the wallet shows {name()} before publishing.</FormNote>
          <Button onClick={props.onAction}>Open wallet</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "transaction_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <HnsStepLabel step={2} />
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h3" variant="h3">Waiting for the wallet transaction</Type></div>
          <FormNote>Publish the prepared update for {name()} in your wallet. This page will continue when the transaction appears.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "tree_commitment_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <HnsStepLabel step={3} />
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h3" variant="h3">Waiting for Handshake confirmation</Type></div>
          <FormNote>The wallet transaction was found. Handshake still needs to include it in a tree commitment.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "secure_connection_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <HnsStepLabel step={3} />
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h3" variant="h3">Finishing the secure connection</Type></div>
          <FormNote>The Handshake update is confirmed. Pirate is waiting for the secure DNS connection to become available.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "records_mismatch"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <HnsStepLabel step={2} />
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h3" variant="h3">Wallet update needs attention</Type></div>
          <FormNote tone="warning">The published settings for {name()} do not match the connection update Pirate prepared.</FormNote>
          <Button onClick={props.onAction}>Review wallet update</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "verifier_unavailable"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <HnsStepLabel step={3} />
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h3" variant="h3">Connection check unavailable</Type></div>
          <FormNote tone="warning">Pirate cannot check {name()} right now. Your wallet transaction is not affected.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Try again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "expired"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h3" variant="h3">Connection request expired</Type></div>
          <FormNote tone="warning">Nothing was changed. Start again to prepare a fresh wallet update for {name()}.</FormNote>
          <Button onClick={props.onAction}>Start again</Button>
        </Card>
      </Show>
    </Show>
  );
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community address</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">The name people can use to open this community.</Type>
      </div>

      <Show when={props.hnsAddState}>
        {(state) => <HnsAddStateCard onAction={props.onAction} state={state()} />}
      </Show>
      <Show when={!props.hnsAddState && props.connectedName}>
        <ConnectedNameCard connectedName={props.connectedName!} />
      </Show>
    </section>
  );
}
