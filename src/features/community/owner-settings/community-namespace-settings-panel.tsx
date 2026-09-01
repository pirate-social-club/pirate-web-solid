import { For, Show, createSignal } from "solid-js";

import {
  Button,
  Card,
  FlatTabBar,
  FlatTabButton,
  FormFieldLabel,
  FormNote,
  IconCheckCircle,
  IconGlobe,
  IconWarningCircle,
  Input,
  OptionCard,
  OptionCardGroup,
  Type,
} from "@pirate/web-solid-ui";
import {
  hasUnsupportedNamespaceRecords,
  type NamespaceFamily,
  type NamespaceNextAction,
  type NamespaceResourceRecord,
  type NamespaceSettingsCommand,
  type NamespaceSettingsSnapshot,
} from "./owner-settings-model";

type NamespacePanelTab = "connect" | "import";

export interface CommunityNamespaceSettingsPanelProps {
  busy?: boolean;
  draftFamily: NamespaceFamily;
  draftRootLabel: string;
  onCommand: (command: NamespaceSettingsCommand) => void;
  onDraftChange: (draft: Readonly<{ family: NamespaceFamily; root_label: string }>) => void;
  snapshot: NamespaceSettingsSnapshot;
}

function commandKey(): string {
  return `storybook-${Date.now()}`;
}

function actionTitle(action: NamespaceNextAction): string {
  if (action.kind === "wait") {
    const labels = {
      verification_pending: "Checking ownership",
      provider_unavailable: "Verifier temporarily unavailable",
      tree_commitment_pending: "Transaction confirmed",
      delegation_insecure: "Records confirmed",
    };
    return labels[action.reason_code];
  }
  if (action.kind === "repair") {
    const labels = {
      challenge_mismatch: "Verification record does not match",
      resource_mismatch: "Published records do not match",
      dnssec_failure: "DNSSEC validation failed",
      delegation_failure: "Delegation is not serving yet",
    };
    return labels[action.reason_code];
  }
  return action.kind;
}

function NamespaceRecordList(props: { records: ReadonlyArray<NamespaceResourceRecord> }) {
  return (
    <div class="overflow-hidden rounded-xl border border-border-soft">
      <For each={props.records}>
        {(record) => (
          <div class="flex items-start gap-3 border-b border-border-soft bg-background px-4 py-3 last:border-b-0">
            <Type as="span" class="w-14 shrink-0 text-muted-foreground" variant="caption">{record.record_type}</Type>
            <code class="min-w-0 flex-1 break-all text-sm leading-6">{record.value}</code>
            <Show when={!record.supported}>
              <span class="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Unsupported</span>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}

function ServerDirectedAction(props: Pick<CommunityNamespaceSettingsPanelProps, "busy" | "onCommand" | "snapshot">) {
  const action = () => props.snapshot.next_action;
  const publishAction = () => {
    const current = action();
    return current.kind === "publish_resource" ? current : null;
  };
  const waitAction = () => {
    const current = action();
    return current.kind === "wait" ? current : null;
  };
  const repairAction = () => {
    const current = action();
    return current.kind === "repair" ? current : null;
  };
  const verifiedAction = () => {
    const current = action();
    return current.kind === "verified" ? current : null;
  };
  const failedAction = () => {
    const current = action();
    return current.kind === "failed" ? current : null;
  };
  const poll = () => props.onCommand({
    kind: "poll",
    expected_generation: props.snapshot.generation,
    idempotency_key: commandKey(),
  });
  const restart = () => props.onCommand({
    kind: "restart",
    expected_generation: props.snapshot.generation,
    idempotency_key: commandKey(),
  });

  return (
    <div class="space-y-5" data-next-action={action().kind}>
      <Show when={action().kind === "start_verification"}>
        <Card class="space-y-4 p-5">
          <Type as="h3" variant="h3">Ready to verify</Type>
          <FormNote>The server will create the ownership challenge and return the next action.</FormNote>
          <Button loading={props.busy} onClick={() => props.onCommand({ kind: "start_verification", idempotency_key: commandKey() })}>
            Start verification
          </Button>
        </Card>
      </Show>

      <Show when={publishAction()}>
        {(publishAction) => (
          <Card class="space-y-5 p-5">
            <Show
              when={!hasUnsupportedNamespaceRecords(publishAction())}
              fallback={
                <div class="space-y-2" role="alert">
                  <div class="flex items-center gap-2"><IconWarningCircle class="size-5 text-warning" /><Type as="h3" variant="h3">Unsupported records</Type></div>
                  <FormNote tone="warning">This name contains records that a form-based HNS wallet cannot preserve. Self-service publishing is blocked; contact support before changing the resource.</FormNote>
                </div>
              }
            >
              <div class="space-y-2">
                <Type as="h3" variant="h3">Publish this complete resource</Type>
                <FormNote tone="warning">Your HNS wallet replaces the complete resource. Publish every record below in one update. Publishing only some records can remove records that are already live.</FormNote>
              </div>
            </Show>
            <NamespaceRecordList records={publishAction().records} />
            <Show when={!hasUnsupportedNamespaceRecords(publishAction())}>
              <Button loading={props.busy} onClick={() => props.onCommand({ kind: "acknowledge_complete_resource", idempotency_key: commandKey() })}>
                I published all records, check the chain
              </Button>
            </Show>
          </Card>
        )}
      </Show>

      <Show when={waitAction()}>
        {(waitAction) => (
          <Card class="space-y-4 p-5" role="status">
            <Type as="h3" variant="h3">{actionTitle(waitAction())}</Type>
            <FormNote>
              {waitAction().reason_code === "tree_commitment_pending"
                ? "Handshake is finalizing the update at the next tree commitment."
                : waitAction().reason_code === "delegation_insecure"
                  ? "The records match, but secure DNSSEC delegation is not observable yet."
                  : waitAction().reason_code === "provider_unavailable"
                    ? "No ownership result was inferred in the browser. Retry after the server-provided interval."
                    : "The ownership proof is still pending."}
            </FormNote>
            <Button loading={props.busy} onClick={poll}>Check status</Button>
            <Type as="p" class="text-muted-foreground" variant="caption">Retry after {waitAction().retry_after_seconds} seconds.</Type>
          </Card>
        )}
      </Show>

      <Show when={repairAction()}>
        {(repairAction) => (
          <Card class="space-y-4 border-warning/50 p-5" role="alert">
            <div class="flex items-center gap-2"><IconWarningCircle class="size-5 text-warning" /><Type as="h3" variant="h3">{actionTitle(repairAction())}</Type></div>
            <FormNote tone="warning">Follow the server response exactly, then check again. The browser does not infer whether DNS or chain state is correct.</FormNote>
            <Show when={(repairAction().missing_records?.length ?? 0) + (repairAction().unexpected_records?.length ?? 0) > 0}>
              <NamespaceRecordList records={[...(repairAction().missing_records ?? []), ...(repairAction().unexpected_records ?? [])]} />
            </Show>
            <Button loading={props.busy} onClick={poll}>Check again</Button>
          </Card>
        )}
      </Show>

      <Show when={verifiedAction()}>
        {(verifiedAction) => (
          <Card class="space-y-3 border-success/40 p-5" role="status">
            <div class="flex items-center gap-2"><IconCheckCircle class="size-5 text-success" /><Type as="h3" variant="h3">Namespace verified</Type></div>
            <FormNote>The namespace is attached as one server-confirmed outcome.</FormNote>
            <a class="font-semibold underline underline-offset-4" href={verifiedAction().canonical_route}>{verifiedAction().canonical_route}</a>
          </Card>
        )}
      </Show>

      <Show when={failedAction()}>
        {(failedAction) => (
          <Card class="space-y-4 border-destructive/40 p-5" role="alert">
            <Type as="h3" variant="h3">Verification failed</Type>
            <FormNote tone="warning">{failedAction().reason_code.replaceAll("_", " ")}</FormNote>
            <Show when={failedAction().retryable}><Button onClick={restart}>Try a new verification</Button></Show>
          </Card>
        )}
      </Show>

      <Show when={action().kind === "expired"}>
        <Card class="space-y-4 border-warning/50 p-5" role="alert">
          <Type as="h3" variant="h3">Verification expired</Type>
          <FormNote tone="warning">Generate a fresh server challenge before publishing anything.</FormNote>
          <Button onClick={restart}>Get a new record list</Button>
        </Card>
      </Show>
    </div>
  );
}

export function CommunityNamespaceSettingsPanel(props: CommunityNamespaceSettingsPanelProps) {
  const [tab, setTab] = createSignal<NamespacePanelTab>("connect");
  const chooseFamily = (value: string) => {
    const family: NamespaceFamily = value === "spaces" ? "spaces" : "hns";
    props.onDraftChange({ family, root_label: props.draftRootLabel });
  };
  const submitNamespace = () => props.onCommand({
    kind: "select_namespace",
    family: props.draftFamily,
    root_label: props.draftRootLabel,
  });

  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-namespace-settings>
      <div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Namespace</Type>
        <Type as="p" class="max-w-2xl text-muted-foreground" variant="body">Attach a human-readable route without storing authority or verification truth in the browser.</Type>
      </div>

      <FlatTabBar columns={2}>
        <FlatTabButton active={tab() === "connect"} onClick={() => setTab("connect")}>Connect HNS or Space</FlatTabButton>
        <FlatTabButton active={tab() === "import"} onClick={() => setTab("import")}>Import HNS zone</FlatTabButton>
      </FlatTabBar>

      <Show when={tab() === "connect" && props.snapshot.next_action.kind === "choose_namespace"}>
        <Card class="space-y-5 p-5 md:p-6">
          <div class="space-y-2">
            <Type as="h3" variant="h3">Choose a namespace</Type>
            <FormNote>HNS names use a leading dot. Spaces use a leading @ and follow their own ownership flow.</FormNote>
          </div>
          <OptionCardGroup label="Namespace family" onChange={chooseFamily} value={props.draftFamily}>
            <OptionCard description="A Handshake root secured by DNSSEC delegation." icon={<IconGlobe class="size-6" />} title="Handshake (HNS)" value="hns" />
            <OptionCard description="A Space identity attached through the Spaces workflow." icon={<span class="text-lg font-bold">@</span>} title="Spaces" value="spaces" />
          </OptionCardGroup>
          <div class="space-y-2">
            <FormFieldLabel htmlFor="community-namespace-root" label={props.draftFamily === "hns" ? "HNS root" : "Space"} required />
            <div class="flex items-center gap-2">
              <span class="text-xl text-muted-foreground">{props.draftFamily === "hns" ? "." : "@"}</span>
              <Input
                id="community-namespace-root"
                onInput={(event) => props.onDraftChange({ family: props.draftFamily, root_label: event.currentTarget.value })}
                placeholder="infinity"
                required
                value={props.draftRootLabel}
              />
            </div>
          </div>
          <Show when={props.snapshot.next_action.kind === "choose_namespace"}>
            <Button disabled={props.draftRootLabel.trim().length === 0} loading={props.busy} onClick={submitNamespace}>Continue</Button>
          </Show>
        </Card>
      </Show>

      <Show when={tab() === "import"}>
        <Card class="space-y-3 p-5 md:p-6">
          <Type as="h3" variant="h3">Import an existing HNS zone</Type>
          <FormNote>Import preserves supported existing records and adds Pirate verification and delegation records. The publish plan below is always supplied by the server.</FormNote>
        </Card>
      </Show>

      <Show when={props.snapshot.next_action.kind !== "choose_namespace"}>
        <ServerDirectedAction busy={props.busy} onCommand={props.onCommand} snapshot={props.snapshot} />
      </Show>
    </section>
  );
}
