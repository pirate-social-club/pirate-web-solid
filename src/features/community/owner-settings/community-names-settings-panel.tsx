import { For, Show } from "solid-js";
import { Button, Card, FormNote, Spinner, Type } from "@pirate/web-solid-ui";
import type {
  CommunityNamesCandidate,
  CommunityNamesManagementSnapshot,
  CommunityNamesOffering,
  CommunityNamesReadyCandidate,
  CommunityNamesSettingsCommand,
} from "./community-names-settings-model";

export interface CommunityNamesSettingsPanelProps {
  busy?: CommunityNamesSettingsCommand["kind"];
  errorMessage?: string;
  loading?: boolean;
  onCommand?: (command: CommunityNamesSettingsCommand) => void;
  onReviewAddress?: () => void;
  showHeading?: boolean;
  snapshot: CommunityNamesManagementSnapshot;
}

function unavailableCopy(reason: Extract<CommunityNamesCandidate, { kind: "unavailable_v1" }>["reason"]): string {
  if (reason === "namespace_authority_unavailable") return "Namespace ownership needs attention before names can be enabled.";
  if (reason === "dns_zone_unavailable") return "Names cannot be served from this namespace yet.";
  return "Finish connecting this Handshake name before enabling names.";
}

function ineffectiveCopy(reason: string): string {
  if (reason === "community_inactive") return "Activate this community to make names available.";
  if (reason === "namespace_authority_lost") return "Namespace ownership needs attention.";
  if (reason === "dns_or_gateway_unhealthy") return "Name hosting is temporarily unavailable.";
  if (reason === "activation_inactive" || reason === "sale_namespace_inactive") return "The name namespace is not active.";
  return "This offering is not currently available.";
}

function NamesSummary(props: { maximum: number; minimum: number; root: string }) {
  return (
    <div class="space-y-3">
      <Type as="p" class="font-mono" variant="h3">yourname.{props.root}</Type>
      <Type as="p" class="text-muted-foreground" variant="body">
        Free names · {props.minimum}–{props.maximum} characters · First come, first served
      </Type>
    </div>
  );
}

function ReadyNamesCard(props: Pick<CommunityNamesSettingsPanelProps, "busy" | "onCommand" | "snapshot"> & { candidate: CommunityNamesReadyCandidate }) {
  const saleNamespace = () => props.snapshot.saleNamespaces.find((item) => item.activation.canonical_root === props.candidate.canonical_root);
  const broadOffering = (): CommunityNamesOffering | undefined => {
    const activationId = saleNamespace()?.activation.sale_namespace_activation_id;
    return props.snapshot.offerings.find((item) => item.offering.sale_namespace_activation_id === activationId && item.offering.label_scope.kind === "label_rule_v2");
  };
  const band = () => {
    const current = broadOffering()?.offering;
    return current?.label_scope.kind === "label_rule_v2"
      ? current.label_scope.availability
      : { min_label_length: 8, max_label_length: 32 };
  };
  const offering = () => broadOffering()?.offering;
  const activationStatus = () => saleNamespace()?.activation.status;
  const ineffectiveReason = () => {
    if (activationStatus() === "pending" || activationStatus() === "revoked") return undefined;
    const namespaceEffectiveness = saleNamespace()?.effectiveness;
    if (namespaceEffectiveness?.kind === "ineffective_v1") return namespaceEffectiveness.reason;
    const offeringEffectiveness = broadOffering()?.effectiveness;
    return offeringEffectiveness?.kind === "ineffective_v1" && offering()?.status !== "paused" ? offeringEffectiveness.reason : undefined;
  };
  const command = (kind: "pause_names" | "resume_names") => {
    const current = offering();
    if (current) props.onCommand?.({ kind, offering: current });
  };

  return (
    <Card class="flex flex-col gap-5 p-5 md:p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <NamesSummary maximum={band().max_label_length} minimum={band().min_label_length} root={props.candidate.display_root} />
        <Show when={offering()} fallback={<span class="rounded-full bg-muted px-3 py-1 text-sm font-semibold capitalize">{activationStatus() === "pending" ? "Setting up" : activationStatus() ?? "Ready"}</span>}>
          {(current) => <span class="rounded-full bg-muted px-3 py-1 text-sm font-semibold capitalize">{current().status}</span>}
        </Show>
      </div>

      <Show when={ineffectiveReason()}>{(reason) => <FormNote tone="warning">{ineffectiveCopy(reason())}</FormNote>}</Show>
      <Show when={activationStatus() === "pending"}><FormNote>Name hosting is being prepared.</FormNote></Show>
      <Show when={activationStatus() === "revoked"}><FormNote tone="warning">Names are no longer enabled for this namespace.</FormNote></Show>
      <Show when={activationStatus() === "suspended" && saleNamespace() !== undefined}>
        <Button
          class="self-start"
          disabled={props.busy !== undefined}
          loading={props.busy === "resume_name_hosting"}
          onClick={() => props.onCommand?.({ activation: saleNamespace()!.activation, kind: "resume_name_hosting" })}
        >Resume name hosting</Button>
      </Show>

      <Show when={!offering() && (activationStatus() === undefined || activationStatus() === "active")}>
        <Button class="self-start" disabled={props.busy !== undefined} loading={props.busy === "enable_names"} onClick={() => props.onCommand?.({ candidate: props.candidate, kind: "enable_names" })}>Enable names</Button>
      </Show>
      <Show when={offering()?.status === "active" && !ineffectiveReason()}>
        <Button class="self-start" disabled={props.busy !== undefined} loading={props.busy === "pause_names"} onClick={() => command("pause_names")} variant="secondary">Pause names</Button>
      </Show>
      <Show when={offering()?.status === "paused"}>
        <Button class="self-start" disabled={props.busy !== undefined} loading={props.busy === "resume_names"} onClick={() => command("resume_names")}>Resume names</Button>
      </Show>
    </Card>
  );
}

export function CommunityNamesSettingsPanel(props: CommunityNamesSettingsPanelProps) {
  return (
    <section class="mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8" data-community-names-settings>
      <Show when={props.showHeading !== false}><div class="space-y-2">
        <Type as="h2" responsiveSize="desktop4xl" variant="h1">Community names</Type>
        <Type as="p" class="text-muted-foreground" variant="body">Offer free names under a connected Handshake namespace.</Type>
      </div></Show>

      <Show when={props.errorMessage}><FormNote tone="destructive">{props.errorMessage}</FormNote></Show>
      <Show when={!props.loading} fallback={<Card class="grid min-h-64 place-items-center" role="status"><div class="flex items-center gap-3"><Spinner class="size-5" /><Type variant="body">Loading names…</Type></div></Card>}>
          <Show when={props.snapshot.context.sale_namespace_candidates.length > 0} fallback={
            <Card class="space-y-4 p-6">
              <Type as="p" variant="body-strong">No namespace is currently available for community names.</Type>
              <Button onClick={props.onReviewAddress} variant="secondary">Review address</Button>
            </Card>
          }>
            <div class="flex flex-col gap-4">
              <For each={props.snapshot.context.sale_namespace_candidates}>{(candidate) => candidate.kind === "ready_v1"
                ? <ReadyNamesCard busy={props.busy} candidate={candidate} onCommand={props.onCommand} snapshot={props.snapshot} />
                : <Card class="space-y-3 p-5 md:p-6"><Type as="p" class="font-mono" variant="h3">.{candidate.display_root}</Type><FormNote tone="warning">{unavailableCopy(candidate.reason)}</FormNote></Card>
              }</For>
            </div>
          </Show>
      </Show>
    </section>
  );
}
