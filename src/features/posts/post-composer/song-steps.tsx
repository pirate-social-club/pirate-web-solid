// Song steps 2-4: Lyrics, Rights, and Review. The draft is the visual
// authority for the first two; the draft's Review step was an unimplemented
// placeholder, so this review summarizes the real draft state — persona,
// song, lyrics, rights, license, and royalty allocation — with a change
// affordance back to the step that owns each value.

import type { JSX } from "@solidjs/web";
import { createSignal, For, Show, type ParentProps } from "solid-js";

import {
  Button,
  CardContent,
  FormNote,
  Input,
  OptionCard,
  OptionCardGroup,
  Switch,
  Textarea,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import {
  basisPointsToPercentText,
  percentTextToBasisPoints,
} from "../media-submission/contracts";
import type { ComposerSteps } from "./composer-steps";
import type { PostComposerController } from "./controller";
import { PostComposerDerivativeSection } from "./derivative-section";
import { FieldLabel } from "./fields";
import { validateSongComposerTerms } from "./media-composer-bridge";
import type {
  AssetLicensePresetId,
  AssetRoyaltyAllocation,
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
export function songTermsIssue(controller: PostComposerController, runtime?: SongFlowRuntime): string {
  const personaId = runtime?.personaId
    ?? controller.royaltySplit.state.allocations.find(row => row.recipientKind === "creator")?.recipientId
    ?? "";
  try {
    validateSongComposerTerms(controller.royaltySplit.state, personaId);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Check the royalty recipients and shares.";
  }
}

function StepCard(props: ParentProps<{
  controller: PostComposerController;
  title: string;
  note?: string;
}>) {
  return (
    <CardContent class={cn("space-y-6 p-8", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
      <div class="space-y-1">
        <Type as="h2" variant="h3" class="text-muted-foreground">{props.title}</Type>
        <Show when={props.note}>
          <Type as="p" variant="caption" class="text-muted-foreground">{props.note}</Type>
        </Show>
      </div>
      {props.children}
    </CardContent>
  );
}

export function SongLyricsStep(props: {
  controller: PostComposerController;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const locked = () => props.runtime?.locked === true;
  const prepared = () => props.runtime
    ? props.runtime.prepared
    : controller.song.state.lyricsEditorState === "ready";
  const [declareNoLyrics, setDeclareNoLyrics] = createSignal(song().lyricsEditorState === "no_lyrics");

  const toggleNoLyrics = (on: boolean) => {
    setDeclareNoLyrics(on);
    // Declaring no lyrics is a real authorship choice: the draft text is
    // cleared so publication cannot bind stale words the author rejected.
    if (on) controller.fields.onLyricsValueChange?.("");
  };

  return (
    <StepCard controller={controller} title={controller.copy.steps.lyrics}>
      <Show
        when={prepared()}
        fallback={<FormNote>{controller.copy.lyrics.uploadFirst}</FormNote>}
      >
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
            <div class="space-y-1">
              <Type as="div" variant="body-strong">{controller.copy.lyrics.noLyricsToggle}</Type>
              <Type as="p" variant="caption" class="text-muted-foreground">{controller.copy.lyrics.noLyricsToggleNote}</Type>
            </div>
            <Switch
              aria-label={controller.copy.lyrics.noLyricsToggle}
              checked={declareNoLyrics()}
              disabled={locked()}
              onChange={toggleNoLyrics}
            />
          </div>

          <label class="block space-y-2">
            <Type as="span" variant="body-strong">Lyrics (optional)</Type>
            <Textarea
              aria-label="Lyrics (optional)"
              class="min-h-36 resize-y"
              disabled={locked() || declareNoLyrics()}
              maxlength={10_000}
              onChange={(event) => controller.fields.onLyricsValueChange?.(event.currentTarget.value)}
              placeholder={controller.copy.placeholders.lyrics}
              value={controller.fields.lyricsValue}
            />
          </label>
          <Type as="p" variant="caption" class="text-muted-foreground">
            {declareNoLyrics()
              ? controller.copy.lyrics.noLyricsToggleNote
              : controller.copy.lyrics.reviewNote}
          </Type>
        </section>
      </Show>
    </StepCard>
  );
}

export function SongRightsStep(props: {
  controller: PostComposerController;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const locked = () => props.runtime?.locked === true;
  const mode = () => controller.primary.activeSongMode;
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

  const updateAllocation = (id: string, patch: Partial<AssetRoyaltyAllocation>) => {
    controller.royaltySplit.update(() => ({
      allocations: controller.royaltySplit.state.allocations.map(allocation =>
        allocation.id === id ? { ...allocation, ...patch } : allocation),
    }));
  };

  const totalBps = () => controller.royaltySplit.state.allocations.reduce(
    (sum, allocation) => sum + allocationBps(allocation), 0);

  return (
    <StepCard controller={controller} title={controller.copy.steps.rights}>
      <fieldset disabled={locked()}>
        <section class="space-y-3">
          <FieldLabel label={controller.copy.rights.songKind} />
          <OptionCardGroup
            label={controller.copy.rights.songKind}
            onChange={(value) => controller.primary.handleSongModeChange(value === "remix" ? "remix" : "original")}
            value={mode()}
          >
            <OptionCard title={controller.copy.songModes.original} value="original" />
            <OptionCard title={controller.copy.songModes.remix} value="remix" />
          </OptionCardGroup>
          <Show when={mode() === "remix"}>
            <PostComposerDerivativeSection
              copy={controller.copy}
              derivativePickerKey={controller.primary.derivativePickerKey}
              derivativeSearchResults={controller.primary.derivativeSearchResults}
              derivativeState={controller.primary.derivativeState}
              onAdvancePicker={controller.advanceDerivativePicker}
              updateDerivativeState={controller.primary.updateDerivativeState}
            />
          </Show>
        </section>

        <section class="space-y-3">
          <FieldLabel label={controller.copy.rights.license} />
          <OptionCardGroup
            label={controller.copy.rights.license}
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
                  aria-label="Downstream commercial remix share"
                  class="border-0 px-0 shadow-none"
                  inputmode="decimal"
                  onChange={(event) => {
                    try {
                      const shareBps = percentTextToBasisPoints(event.currentTarget.value);
                      controller.license.update(current => ({
                        ...current,
                        commercialRevShareBps: shareBps,
                        commercialRevSharePct: shareBps / 100,
                      }));                    } catch {
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
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <Type as="h3" variant="body-strong">Creator allocation</Type>
              <Type as="p" variant="caption" class="text-muted-foreground">{controller.copy.rights.recipientsNote}</Type>
            </div>
            <Type
              as="span"
              variant="label"
              class={totalBps() === 10_000 ? "text-primary-text" : "text-destructive-text"}
            >
              {String(totalBps() / 100)}%
            </Type>
          </div>
          <For each={controller.royaltySplit.state.allocations}>
            {(allocation, index) => (
              <div class="grid gap-2 rounded-[var(--radius-lg)] border border-border-soft p-3 sm:grid-cols-[1fr_8rem_auto]">
                <Input
                  aria-label={`Recipient ${index() + 1} id`}
                  disabled={allocation.recipientKind === "creator"}
                  onChange={(event) => updateAllocation(allocation.id, { recipientId: event.currentTarget.value })}
                  placeholder="persona id"
                  value={allocation.recipientId ?? ""}
                />
                <div class="grid grid-cols-[1fr_auto] items-center rounded-[var(--radius-lg)] border border-border-soft px-3">
                  <Input
                    aria-label={`Recipient ${index() + 1} share`}
                    class="border-0 px-0 shadow-none"
                    inputmode="decimal"
                    onChange={(event) => {
                      try {
                        const shareBps = percentTextToBasisPoints(event.currentTarget.value);
                        updateAllocation(allocation.id, { shareBps, sharePct: shareBps / 100 });
                      } catch {
                        event.currentTarget.value = basisPointsToPercentText(allocationBps(allocation));
                      }
                    }}
                    value={basisPointsToPercentText(allocationBps(allocation))}
                  />
                  <span class="text-muted-foreground">%</span>
                </div>
                <Show when={allocation.recipientKind !== "creator"} fallback={<span />}>
                  <Button
                    aria-label={`Remove recipient ${index() + 1}`}
                    onClick={() => controller.royaltySplit.update(() => ({
                      allocations: controller.royaltySplit.state.allocations.filter(item => item.id !== allocation.id),
                    }))}
                    variant="ghost"
                  >Remove</Button>
                </Show>
              </div>
            )}
          </For>
          <Button
            onClick={() => controller.royaltySplit.update(() => ({
              allocations: [...controller.royaltySplit.state.allocations, {
                id: `recipient-${Math.max(0, ...controller.royaltySplit.state.allocations.map(row => Number(row.id.replace("recipient-", "")) || 0)) + 1}`,
                recipientKind: "collaborator",
                recipientId: "",
                shareBps: 1,
                sharePct: 0.01,
              }],
            }))}
            variant="outline"
          >Add collaborator</Button>
          <Show when={totalBps() !== 10_000}>
            <Type as="p" variant="caption" class="text-destructive-text">{controller.copy.rights.totalExact}</Type>
          </Show>
        </section>
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

export function SongReviewStep(props: {
  controller: PostComposerController;
  runtime?: SongFlowRuntime;
  steps: ComposerSteps;
}) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const issue = () => songTermsIssue(controller, props.runtime);
  const personaLabel = () => {
    const persona = controller.identity.publicPersonas?.find(
      candidate => candidate.personaId === controller.identity.publicPersonaId);
    return persona?.handle ?? persona?.displayName ?? controller.identity.identity?.publicHandle ?? "—";
  };
  const licenseLabel = () => controller.copy.assetLicense.song[controller.license.state.presetId];
  const kindLabel = () => controller.primary.activeSongMode === "remix"
    ? controller.copy.songModes.remix
    : controller.copy.songModes.original;
  const sourceCount = () => controller.primary.derivativeState?.references?.length ?? 0;

  return (
    <StepCard controller={controller} title={controller.copy.steps.review}>
      <Show when={issue()}>
        <FormNote tone="warning">{issue()}</FormNote>
      </Show>
      <div class="rounded-[var(--radius-lg)] px-1">
        <ReviewRow label={controller.copy.review.persona} value={personaLabel()} />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("song") }}
          label={controller.copy.review.song}
          value={(
            <span class="block truncate">
              {song().title?.trim() || "—"}
              <Show when={song().primaryAudioLabel || song().primaryAudioUpload?.name}>
                <Type as="span" variant="caption" class="block truncate text-muted-foreground">
                  {song().primaryAudioUpload?.name ?? song().primaryAudioLabel}
                </Type>
              </Show>
            </span>
          )}
        />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("lyrics") }}
          label={controller.copy.review.lyrics}
          value={controller.fields.lyricsValue.trim() === ""
            ? controller.copy.review.noLyrics
            : <span class="line-clamp-2">{controller.fields.lyricsValue}</span>}
        />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.rights}
          value={`${kindLabel()}${controller.primary.activeSongMode === "remix" ? ` · ${sourceCount()} source${sourceCount() === 1 ? "" : "s"}` : ""}`}
        />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.license}
          value={licenseLabel()}
        />
        <ReviewRow
          action={{ label: controller.copy.review.change, onClick: () => props.steps.set("rights") }}
          label={controller.copy.review.recipients(controller.royaltySplit.state.allocations.length)}
          value={controller.royaltySplit.state.allocations
            .map(allocation => basisPointsToPercentText(allocationBps(allocation))).join(" / ") + "%"}
        />
      </div>
    </StepCard>
  );
}
