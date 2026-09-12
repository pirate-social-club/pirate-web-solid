// Song steps: Rights and Review. The song itself, including optional lyrics
// and the original/remix choice, lives on the Song step; these steps decide
// what others may do with the song, how its earnings are shared, and confirm
// the whole submission in readable terms.

import type { JSX } from "@solidjs/web";
import { For, Show, type ParentProps } from "solid-js";

import {
  Button,
  CardContent,
  FormNote,
  Input,
  OptionCard,
  OptionCardGroup,
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
  AssetLicensePresetId,
  AssetRoyaltyAllocation,
  ComposerRecipientProfile,
  SongFlowRuntime,
} from "./types";

const licensePresets: readonly AssetLicensePresetId[] = [
  "non-commercial",
  "commercial-use",
  "commercial-remix",
];

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
      <Type as="h2" variant="h3">{props.title}</Type>
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

  const selectLicense = (preset: AssetLicensePresetId) => {
    controller.license.update((current) => ({
      presetId: preset,
      commercialRevShareBps: preset === "commercial-remix"
        ? current.commercialRevShareBps ?? 1_000
        : undefined,
      commercialRevSharePct: preset === "commercial-remix"
        ? current.commercialRevSharePct ?? 10
        : undefined,
    }));
  };

  return (
    <StepCard controller={controller} title={controller.copy.steps.rights}>
      <fieldset disabled={locked()}>
        <section class="space-y-3">
          <FieldLabel label={controller.copy.rights.permissionsTitle} />
          <OptionCardGroup
            label={controller.copy.rights.permissionsTitle}
            onChange={(value) => {
              const preset = licensePresets.find(candidate => candidate === value);
              if (preset) selectLicense(preset);
            }}
            value={license()}
          >
            <For each={[...licensePresets]}>
              {(preset) => (
                <OptionCard
                  description={controller.copy.assetLicense.song[`${preset}Description`]}
                  title={controller.copy.assetLicense.song[preset]}
                  value={preset}
                />
              )}
            </For>
          </OptionCardGroup>
          <Show when={license() === "commercial-remix"}>
            <label class="block space-y-2">
              <Type as="span" variant="body-strong">{controller.copy.rights.revShare}</Type>
              <div class="grid max-w-xs grid-cols-[1fr_auto] items-center rounded-[var(--radius-lg)] border border-border-soft px-4">
                <Input
                  aria-label="Your share of remix earnings"
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
          </Show>
          <details class="text-base text-muted-foreground">
            <summary class="cursor-pointer select-none font-medium text-foreground">
              {controller.copy.rights.fullTerms}
            </summary>
            <ul class="mt-2 space-y-2">
              <For each={[...licensePresets]}>
                {(preset) => (
                  <li>
                    <Type as="span" variant="body-strong">{controller.copy.assetLicense.song[preset]}</Type>
                    {" — "}
                    {controller.copy.assetLicense.song[`${preset}Terms`]}
                  </li>
                )}
              </For>
            </ul>
          </details>
        </section>

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
  const licenseLabel = () => controller.copy.assetLicense.song[controller.license.state.presetId];
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
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
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
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
          label={controller.copy.review.lyrics}
          value={controller.fields.lyricsValue.trim() === ""
            ? "Instrumental"
            : <span class="line-clamp-2">{controller.fields.lyricsValue}</span>}
        />
        <Show when={controller.primary.activeSongMode === "remix"}>
          <ReviewRow
            action={{ label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
            label={controller.copy.review.sources}
            value={references().length === 0
              ? controller.copy.derivative.chooseSource
              : references().map(reference => reference.title).join(" · ")}
          />
        </Show>
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.permissions}
          value={licenseLabel()}
        />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.earnings}
          value={earningsSummary()}
        />
      </div>
    </StepCard>
  );
}
