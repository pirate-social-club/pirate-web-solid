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
          <Type as="p" class="text-muted-foreground" variant="body">
            {props.connectedName.providerLabel} · <a class="underline underline-offset-4" href={props.connectedName.fallbackAddress}>{props.connectedName.fallbackLabel}</a>
          </Type>
        </div>
      </div>
      <a class={buttonVariants({ variant: "secondary" })} href={props.connectedName.address} rel="noreferrer" target="_blank">
        Open name
      </a>
    </Card>
  );
}

function HnsAddStateCard(props: { onAction?: () => void; state: HnsAddState }) {
  const name = () => `${props.state.rootLabel}/`;

  return (
    <Show
      when={props.state.kind !== "enter_name"}
      fallback={
        <Card class="space-y-5 p-5 md:p-6">
          <Type as="h2" variant="h2">Add Handshake name</Type>
          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-hns-name" label="Handshake name" required />
            <div class="flex items-center gap-2">
              <Input id="community-hns-name" value={props.state.rootLabel} />
              <span class="text-lg text-muted-foreground">/</span>
            </div>
            <FormNote>app.{props.state.rootLabel} · pirate.sc/c/{props.state.rootLabel}</FormNote>
          </div>
          <Button onClick={props.onAction}>Continue</Button>
        </Card>
      }
    >
      <Show when={props.state.kind === "wallet_action"}>
        <Card class="space-y-5 p-5 md:p-6">
          <Type as="h2" variant="h2">Update {name()} in your wallet</Type>
          <FormNote tone="warning">Review and publish the prepared DNS update.</FormNote>
          <Button onClick={props.onAction}>Open wallet</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "transaction_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h2" variant="h2">Waiting for wallet</Type></div>
          <FormNote>Publish the prepared update for {name()}.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "tree_commitment_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h2" variant="h2">Confirming on Handshake</Type></div>
          <FormNote>The wallet transaction was found and is awaiting confirmation.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "secure_connection_pending"}>
        <Card class="space-y-4 p-5 md:p-6" role="status">
          <div class="flex items-center gap-3"><Spinner size="sm" /><Type as="h2" variant="h2">Connecting {name()}</Type></div>
          <FormNote>Handshake confirmed the update. Secure routing is coming online.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Check again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "records_mismatch"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h2" variant="h2">Wallet update does not match</Type></div>
          <FormNote tone="warning">Review the prepared update for {name()} and publish it again.</FormNote>
          <Button onClick={props.onAction}>Review wallet update</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "verifier_unavailable"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h2" variant="h2">Cannot check {name()}</Type></div>
          <FormNote tone="warning">Your wallet transaction is not affected.</FormNote>
          <Button onClick={props.onAction} variant="secondary">Try again</Button>
        </Card>
      </Show>

      <Show when={props.state.kind === "expired"}>
        <Card class="space-y-4 border-warning/50 p-5 md:p-6" role="alert">
          <div class="flex items-center gap-3"><IconWarningCircle class="size-5 text-warning" /><Type as="h2" variant="h2">Connection expired</Type></div>
          <FormNote tone="warning">Start again to prepare a fresh update for {name()}.</FormNote>
          <Button onClick={props.onAction}>Start again</Button>
        </Card>
      </Show>
    </Show>
  );
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <Show when={props.hnsAddState}>
        {(state) => <HnsAddStateCard onAction={props.onAction} state={state()} />}
      </Show>
      <Show when={!props.hnsAddState && props.connectedName}>
        <div class="space-y-2">
          <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community address</Type>
          <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">The name people can use to open this community.</Type>
        </div>
        <ConnectedNameCard connectedName={props.connectedName!} />
      </Show>
    </section>
  );
}
