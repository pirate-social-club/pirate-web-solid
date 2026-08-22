// Song steps 2-4. Lyrics (step 2) and Rights (step 3) are implemented;
// Review (step 4) remains a placeholder until it lands after the Rights
// milestone review.

import { For, Show, type ParentProps } from "solid-js";

import { CardContent, OptionCard, Switch, Type } from "../../../design-system";
import { cn } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerDerivativeSection } from "./derivative-section";
import { FieldLabel, LabeledTextarea, UploadField } from "./fields";
import type { AssetLicensePresetId } from "./types";

const licensePresets: AssetLicensePresetId[] = [
  "non-commercial",
  "commercial-use",
  "commercial-remix",
];

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

export function SongLyricsStep(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const isInstrumental = () => song().isInstrumental === true;

  const setInstrumental = (on: boolean) => {
    controller.song.update((current) => ({ ...current, isInstrumental: on }));
  };

  return (
    <StepCard controller={controller} title={controller.copy.steps.lyrics}>
      <section class="space-y-3">
        <div class="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
          <div class="space-y-1">
            <Type as="div" variant="body-strong">
              {controller.copy.lyrics.instrumentalToggle}
            </Type>
            <Type as="p" variant="caption" class="text-muted-foreground">
              {controller.copy.lyrics.instrumentalToggleNote}
            </Type>
          </div>
          <Switch
            aria-label={controller.copy.lyrics.instrumentalToggle}
            checked={isInstrumental()}
            onChange={setInstrumental}
          />
        </div>

        <LabeledTextarea
          class="min-h-36"
          disabled={isInstrumental()}
          label={controller.copy.fields.lyrics}
          onChange={controller.fields.onLyricsValueChange}
          placeholder={controller.copy.placeholders.lyrics}
          value={controller.fields.lyricsValue}
        />
      </section>

      <section class="space-y-3">
        <div class="grid gap-3 md:grid-cols-2">
          <UploadField
            accept="audio/*"
            label={controller.copy.fields.instrumentalStem}
            onChange={(files) =>
              controller.song.update((current) => ({
                ...current,
                instrumentalAudioLabel: files?.[0]?.name ?? current.instrumentalAudioLabel,
                instrumentalAudioUpload: files?.[0] ?? null,
              }))
            }
            onClear={() =>
              controller.song.update((current) => ({
                ...current,
                instrumentalAudioLabel: undefined,
                instrumentalAudioUpload: null,
              }))
            }
            selectedLabel={song().instrumentalAudioUpload?.name ?? song().instrumentalAudioLabel}
          />
          <UploadField
            accept="audio/*"
            label={controller.copy.fields.vocalStem}
            onChange={(files) =>
              controller.song.update((current) => ({
                ...current,
                vocalAudioLabel: files?.[0]?.name ?? current.vocalAudioLabel,
                vocalAudioUpload: files?.[0] ?? null,
              }))
            }
            onClear={() =>
              controller.song.update((current) => ({
                ...current,
                vocalAudioLabel: undefined,
                vocalAudioUpload: null,
              }))
            }
            selectedLabel={song().vocalAudioUpload?.name ?? song().vocalAudioLabel}
          />
        </div>
        <Type as="p" variant="caption" class="text-muted-foreground">
          {controller.copy.lyrics.stemNote}
        </Type>
      </section>
    </StepCard>
  );
}

export function SongRightsStep(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const mode = () => controller.primary.activeSongMode;
  const license = () => controller.license.state.presetId;

  const selectLicense = (preset: AssetLicensePresetId) => {
    controller.license.update((current) => ({
      presetId: preset,
      commercialRevSharePct: preset === "commercial-remix"
        ? current.commercialRevSharePct ?? 10
        : undefined,
    }));
  };

  return (
    <StepCard controller={controller} title={controller.copy.steps.rights}>
      <section class="space-y-3">
        <FieldLabel label={controller.copy.rights.songKindLabel} />
        <OptionCard
          onClick={() => controller.primary.handleSongModeChange("original")}
          selected={mode() === "original"}
          title={controller.copy.songModes.original}
        />
        <OptionCard
          onClick={() => controller.primary.handleSongModeChange("remix")}
          selected={mode() === "remix"}
          title={controller.copy.songModes.remix}
        />
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
        <FieldLabel label={controller.copy.rights.licenseSheetTitle} />
        <For each={licensePresets}>
          {(preset) => (
            <OptionCard
              onClick={() => selectLicense(preset)}
              selected={license() === preset}
              title={controller.copy.rights.licenseTitles[preset]}
            />
          )}
        </For>
      </section>
    </StepCard>
  );
}

function PlaceholderStep(props: {
  controller: PostComposerController;
  title: string;
  note: string;
}) {
  return (
    <CardContent class={cn("space-y-6 p-8", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
      <div class="space-y-1">
        <Type as="h2" variant="h3" class="text-muted-foreground">{props.title}</Type>
        <Type as="p" variant="caption" class="text-muted-foreground">{props.note}</Type>
      </div>
    </CardContent>
  );
}

export function SongReviewStep(props: { controller: PostComposerController }) {
  return (
    <PlaceholderStep
      controller={props.controller}
      note="A summary of every setting with change affordances, audience, and an add-collaborators link land here."
      title={props.controller.copy.steps.review}
    />
  );
}
