// Song steps 2-4. Lyrics (step 2) is implemented; Rights and Review remain
// placeholders until their content lands after the Lyrics milestone review.

import { Show, type ParentProps } from "solid-js";

import { CardContent, Switch, Type } from "../../../design-system";
import { cn } from "../../../design-system";
import { LabeledTextarea, UploadField } from "./fields";
import type { PostComposerController } from "./controller";

function StepCard(props: ParentProps<{
  controller: PostComposerController;
  title: string;
  note?: string;
}>) {
  return (
    <CardContent class={cn("space-y-6 p-5", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
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
    if (on) controller.fields.onLyricsValueChange?.("");
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

function PlaceholderStep(props: {
  controller: PostComposerController;
  title: string;
  note: string;
}) {
  return (
    <CardContent class={cn("space-y-6 p-5", props.controller.isMobile() && "px-0 pb-4 pt-1")}>
      <div class="space-y-1">
        <Type as="h2" variant="h3" class="text-muted-foreground">{props.title}</Type>
        <Type as="p" variant="caption" class="text-muted-foreground">{props.note}</Type>
      </div>
    </CardContent>
  );
}

export function SongRightsStep(props: { controller: PostComposerController }) {
  return (
    <PlaceholderStep
      controller={props.controller}
      note="Original or remix with the source picker, then license as three option cards land here."
      title={props.controller.copy.steps.rights}
    />
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
