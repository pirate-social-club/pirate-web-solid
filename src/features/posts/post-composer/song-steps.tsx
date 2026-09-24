// Song steps: Royalties and Review. Every new song is published as "Remix and
// sell"; the Royalties step sets the author's share of remix earnings and the
// split between collaborators, and Review confirms the submission.

import type { JSX } from "@solidjs/web";
import { Show, type ParentProps } from "solid-js";

import {
  Button,
  CardContent,
  FormNote,
  Input,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import {
  basisPointsToPercentText,
  percentTextToBasisPoints,
} from "../media-submission/contracts";
import type { ComposerSteps } from "./composer-steps";
import type { PostComposerController } from "./controller";
import { EarningsSplit, royaltySplitIssue } from "./earnings-split";
import { FieldLabel } from "./fields";
import { createObjectUrl } from "./media-hooks";
import type {
  AssetRoyaltyAllocation,
  ComposerRecipientProfile,
  SongFlowRuntime,
} from "./types";

function allocationBps(allocation: AssetRoyaltyAllocation): number {
  return allocation.shareBps ?? Math.round(allocation.sharePct * 100);
}

/** The exact validation the publish path runs, surfaced where it is edited. */
export function songTermsIssue(
  controller: PostComposerController,
  runtime?: SongFlowRuntime,
): string {
  const personaId = runtime?.personaId
    ?? controller.royaltySplit.state.allocations.find(row => row.recipientKind === "creator")?.recipientId;
  return royaltySplitIssue(controller.royaltySplit.state, personaId, controller.copy);
}

function StepCard(props: ParentProps<{
  controller: PostComposerController;
  title: string;
}>) {
  return (
    <CardContent class={cn("space-y-6 p-8", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
      {/* On mobile the step name sits in the header. */}
      <Show when={!props.controller.isMobile()}>
        <Type as="h2" variant="h3">{props.title}</Type>
      </Show>
      {props.children}
    </CardContent>
  );
}

export function SongRightsStep(props: {
  controller: PostComposerController;
  recipients?: readonly ComposerRecipientProfile[];
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const locked = () => props.runtime?.locked === true;
  const license = () => controller.license.state.presetId;
  const issue = () => songTermsIssue(controller, props.runtime);

  const remixShare = () => (
    <label class="block space-y-2">
      <Type as="span" variant="body-strong">{controller.copy.rights.revShare}</Type>
      <Type as="p" variant="caption" class="text-muted-foreground">{controller.copy.rights.revShareHint}</Type>
      <div class="grid max-w-40 grid-cols-[1fr_auto] items-center rounded-[var(--radius-lg)] border border-border-soft px-4">
        <Input
          aria-label={controller.copy.rights.revShare}
          class="border-0 px-0 shadow-none"
          inputmode="decimal"
          onChange={(event) => {
            try {
              const shareBps = percentTextToBasisPoints(event.currentTarget.value);
              controller.license.update(current => ({
                ...current,
                commercialRevShareBps: shareBps,
                commercialRevSharePct: shareBps / 100,
              }));
            } catch {
              event.currentTarget.value = basisPointsToPercentText(
                controller.license.state.commercialRevShareBps ?? 1_000);
            }
          }}
          value={basisPointsToPercentText(controller.license.state.commercialRevShareBps ?? 1_000)}
        />
        <span class="text-muted-foreground">%</span>
      </div>
    </label>
  );

  // Every new song is "Remix and sell"; the author only chooses their share.
  // A recovered submission bound to another preset keeps it, read-only.
  return (
    <StepCard controller={controller} title={controller.copy.steps.rights}>
      <fieldset class="space-y-8" disabled={locked()}>
        <Show
          when={license() === "commercial-remix"}
          fallback={<Type as="p" class="text-muted-foreground">{controller.copy.assetLicense.song[license()]}</Type>}
        >
          {remixShare()}
        </Show>

        <EarningsSplit
          authorPersonaId={props.runtime?.personaId}
          copy={controller.copy}
          disabled={locked()}
          onChange={value => controller.royaltySplit.update(() => value)}
          recipients={props.recipients ?? []}
          split={controller.royaltySplit.state}
        />
      </fieldset>
      <Show when={issue()}>
        <FormNote tone="warning">{issue()}</FormNote>
      </Show>
    </StepCard>
  );
}

function ReviewRow(props: {
  action?: { label: string; onClick: () => void };
  label: string;
  value: JSX.Element;
}) {
  return (
    <div class="flex items-start justify-between gap-3 border-b border-border-soft py-3 last:border-b-0">
      <div class="min-w-0">
        <Type as="p" variant="caption" class="text-muted-foreground">{props.label}</Type>
        <div class="mt-0.5 min-w-0 text-base text-foreground">{props.value}</div>
      </div>
      <Show when={props.action}>
        <Button onClick={props.action!.onClick} size="sm" variant="ghost">
          {props.action!.label}
        </Button>
      </Show>
    </div>
  );
}

function recipientLabel(
  allocation: AssetRoyaltyAllocation,
  recipients: readonly ComposerRecipientProfile[],
  youLabel: string,
): string {
  if (allocation.recipientKind === "creator") return youLabel;
  const profile = recipients.find(candidate => candidate.personaId === allocation.recipientId);
  const handle = profile?.handle?.trim();
  if (handle) return handle.startsWith("@") ? handle : `@${handle}`;
  return profile?.displayName?.trim() || "Collaborator";
}

export function SongReviewStep(props: {
  controller: PostComposerController;
  recipients?: readonly ComposerRecipientProfile[];
  runtime?: SongFlowRuntime;
  steps: ComposerSteps;
}) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const cover = createObjectUrl(() => controller.song.state.coverUpload);
  const issue = () => songTermsIssue(controller, props.runtime);
  const licenseLabel = () => controller.license.state.presetId === "commercial-remix"
    ? `${basisPointsToPercentText(controller.license.state.commercialRevShareBps ?? 1_000)}%`
    : controller.copy.assetLicense.song[controller.license.state.presetId];
  const references = () => controller.primary.derivativeState?.references ?? [];
  const earningsSummary = () => controller.royaltySplit.state.allocations
    .map(allocation =>
      `${recipientLabel(allocation, props.recipients ?? [], controller.copy.review.you)} ${basisPointsToPercentText(allocationBps(allocation))}%`)
    .join(" · ");

  return (
    <StepCard controller={controller} title={controller.copy.steps.review}>
      <Show when={issue()}>
        <FormNote tone="warning">{issue()}</FormNote>
      </Show>
      <div class="rounded-[var(--radius-lg)] px-1">
        <ReviewRow
          action={props.runtime?.locked ? undefined : { label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
          label={controller.copy.review.song}
          value={(
            <span class="flex min-w-0 items-center gap-3">
              <Show when={cover()}>
                {(url) => (
                  <img
                    alt=""
                    class="size-12 shrink-0 rounded-[var(--radius-md)] border border-border-soft object-cover"
                    src={url()}
                  />
                )}
              </Show>
              <span class="min-w-0 truncate">{song().title?.trim() || "—"}</span>
            </span>
          )}
        />
        <ReviewRow
          action={props.runtime?.locked ? undefined : { label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
          label={controller.copy.review.lyrics}
          value={controller.fields.lyricsValue.trim() === ""
            ? controller.copy.review.noLyrics
            : <span class="line-clamp-2">{controller.fields.lyricsValue}</span>}
        />
        <Show when={controller.primary.activeSongMode === "remix"}>
          <ReviewRow
            action={props.runtime?.locked ? undefined : { label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
            label={controller.copy.review.sources}
            value={references().length === 0
              ? controller.copy.derivative.chooseSource
              : references().map(reference => reference.title).join(" · ")}
          />
        </Show>
        <ReviewRow
          action={props.runtime?.locked ? undefined : { label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.permissions}
          value={licenseLabel()}
        />
        <ReviewRow
          action={props.runtime?.locked ? undefined : { label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.earnings}
          value={earningsSummary()}
        />
      </div>
    </StepCard>
  );
}
