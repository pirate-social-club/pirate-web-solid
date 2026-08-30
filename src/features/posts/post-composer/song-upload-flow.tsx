import { For, Show, createSignal } from "solid-js";

import {
  Button,
  IconArrowLeft,
  IconButton,
  IconCaretRight,
  IconImage,
  IconMagnifyingGlass,
  IconMusicNote,
  IconPause,
  IconPlay,
  IconX,
  Input,
  Textarea,
  Type,
  cn,
} from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerField } from "./fields";
import { PostComposerPageFrame } from "./form-shell";
import { PostComposerIdentityControl } from "./identity-control";
import { createObjectUrl } from "./media-hooks";
import { PostComposerPublishControls } from "./publish-controls";
import { PostComposerPreviewSegmentSelector } from "./preview-segment-selector";
import { PostComposerPercentageField } from "./percentage-field";
import { PostComposerSegmentedControl } from "./segmented-control";
import { PublishButton } from "./submit-actions";
import type { ComposerReference } from "./types";

type SongFlowStep = 1 | 2 | 3 | 4;

function displayPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StepHeader(props: {
  controller: PostComposerController;
  onBack: () => void;
  step: SongFlowStep;
  title: string;
}) {
  return (
    <div class="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_5.5rem] items-center gap-3">
      <IconButton
        aria-label={props.step === 1 ? "Close song upload" : "Previous step"}
        class="size-10 bg-secondary"
        onClick={props.onBack}
        variant="secondary"
      >
        {props.step === 1 ? <IconX class="size-5" /> : <IconArrowLeft class="size-5" />}
      </IconButton>
      <div class="flex min-w-0 items-baseline gap-2">
        <Type as="h1" variant="h3" class="truncate">{props.title}</Type>
        <Show when={props.step < 4}>
          <Type as="span" variant="caption" class="shrink-0 text-muted-foreground">{props.step} of 3</Type>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <PostComposerPublishControls controller={props.controller} presentation="icon" />
        <PostComposerIdentityControl controller={props.controller} presentation="icon" />
      </div>
    </div>
  );
}

function SongStep(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const audioUrl = createObjectUrl(() => controller.song.state.primaryAudioUpload);
  const coverUrl = createObjectUrl(() => controller.song.state.coverUpload);
  const [playing, setPlaying] = createSignal(false);
  let audioElement: HTMLAudioElement | undefined;
  let coverInput: HTMLInputElement | undefined;

  const togglePlayback = () => {
    if (!audioElement || !audioUrl()) {
      setPlaying((current) => !current);
      return;
    }
    if (audioElement.paused) void audioElement.play();
    else audioElement.pause();
  };

  const updateCover = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    controller.song.update((current) => ({
      ...current,
      coverLabel: file.name,
      coverSource: "upload",
      coverUpload: file,
    }));
  };

  return (
    <div class="space-y-5 px-6 py-6">
      <section class="overflow-hidden rounded-[var(--radius-xl)] bg-card">
        <div class="relative aspect-square max-h-[342px] w-full overflow-hidden bg-gradient-to-br from-sky-950 via-slate-900 to-amber-950">
          <Show
            when={coverUrl()}
            fallback={<IconMusicNote class="absolute inset-0 m-auto size-16 text-white/45" />}
          >
            {(src) => <img alt="Song cover" class="h-full w-full object-cover" src={src()} />}
          </Show>
          <Button
            class="absolute right-3 top-3 h-10 bg-background/90 px-3 backdrop-blur"
            leadingIcon={<IconImage class="size-4" />}
            onClick={() => coverInput?.click()}
            size="sm"
            variant="secondary"
          >
            Edit cover
          </Button>
          <input
            accept="image/*"
            aria-label="Upload song cover"
            class="sr-only"
            ref={coverInput}
            type="file"
            onChange={(event) => updateCover(event.currentTarget.files)}
          />
        </div>
        <div class="flex h-14 items-center gap-3 px-3">
          <Button
            aria-label={playing() ? "Pause song preview" : "Play song preview"}
            class="size-9 shrink-0 rounded-full p-0"
            onClick={togglePlayback}
          >
            {playing() ? <IconPause class="size-4" /> : <IconPlay class="size-4" filled />}
          </Button>
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div class="h-full w-[18%] rounded-full bg-primary" />
          </div>
          <Type as="span" variant="caption" class="tabular-nums text-muted-foreground">3:42</Type>
          <Show when={audioUrl()}>
            {(src) => (
              <audio
                ref={audioElement}
                src={src()}
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
              />
            )}
          </Show>
        </div>
      </section>

      <label class="block space-y-2">
        <Type as="span" variant="caption">Song title</Type>
        <Input
          aria-label="Song title"
          class="h-12 rounded-[var(--radius-xl)] bg-card px-3.5 text-base"
          maxlength={300}
          onChange={(event) => controller.song.update((current) => ({ ...current, title: event.currentTarget.value }))}
          placeholder="Song title"
          value={controller.song.state.title ?? ""}
        />
      </label>

      <label class="block space-y-2">
        <Type as="span" variant="caption">Lyrics (optional)</Type>
        <Textarea
          aria-label="Lyrics (optional)"
          class="min-h-28 resize-none rounded-[var(--radius-xl)] bg-card px-3.5 py-3 text-base"
          maxlength={10_000}
          onChange={(event) => controller.fields.onLyricsValueChange?.(event.currentTarget.value)}
          placeholder="Add lyrics"
          value={controller.fields.lyricsValue}
        />
      </label>
    </div>
  );
}

function PricingStep(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const audioUrl = createObjectUrl(() => controller.song.state.primaryAudioUpload);
  const [previewPlaying, setPreviewPlaying] = createSignal(false);
  let previewAudio: HTMLAudioElement | undefined;
  const previewStart = () => Math.min(192, Math.max(0, Number(controller.song.state.previewStartSeconds) || 0));
  const paid = () => controller.commerce.monetizationState.visible;
  const setPaid = (value: string) => controller.commerce.updateMonetizationState((current) => ({
    ...current,
    priceUsd: value === "paid" ? current.priceUsd || "4.99" : current.priceUsd,
    visible: value === "paid",
  }));
  const updatePreviewStart = (startSeconds: number) => {
    controller.song.update((current) => ({ ...current, previewStartSeconds: String(startSeconds) }));
    if (previewAudio && previewPlaying()) previewAudio.currentTime = startSeconds;
  };
  const togglePreview = () => {
    if (!previewAudio || !audioUrl()) {
      setPreviewPlaying((current) => !current);
      return;
    }
    if (previewAudio.paused) {
      previewAudio.currentTime = previewStart();
      void previewAudio.play();
    } else {
      previewAudio.pause();
    }
  };

  return (
    <div class="space-y-4 px-6 py-6">
      <PostComposerSegmentedControl
        aria-label="Pricing"
        onChange={setPaid}
        options={[{ label: "Free", value: "free" }, { label: "Paid", value: "paid" }]}
        value={paid() ? "paid" : "free"}
      />

      <Show when={paid()}>
        <PostComposerField htmlFor="song-sale-price" label="Sale price" tone="muted">
          <div class="grid h-12 grid-cols-[auto_1fr] items-center rounded-[var(--radius-xl)] border border-input bg-card px-3.5">
            <span class="font-semibold text-foreground">$</span>
            <Input
              aria-label="Sale price"
              class="h-11 rounded-none border-0 bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0"
              id="song-sale-price"
              inputmode="decimal"
              onChange={(event) => controller.commerce.updateMonetizationState((current) => ({ ...current, priceUsd: event.currentTarget.value }))}
              value={controller.commerce.monetizationState.priceUsd ?? ""}
            />
          </div>
        </PostComposerField>

        <PostComposerPreviewSegmentSelector
          durationSeconds={222}
          onChange={updatePreviewStart}
          onTogglePreview={togglePreview}
          playing={previewPlaying()}
          startSeconds={previewStart()}
        />
        <Show when={audioUrl()}>
          {(src) => (
            <audio
              ref={previewAudio}
              src={src()}
              onEnded={() => setPreviewPlaying(false)}
              onPause={() => setPreviewPlaying(false)}
              onPlay={() => setPreviewPlaying(true)}
              onTimeUpdate={(event) => {
                if (event.currentTarget.currentTime >= previewStart() + 30) event.currentTarget.pause();
              }}
            />
          )}
        </Show>
      </Show>
    </div>
  );
}

function RemixSourcePicker(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const state = () => controller.primary.derivativeState;
  const references = () => state()?.references ?? [];
  const suggestions = () => (state()?.searchResults ?? []).filter((result) =>
    !references().some((reference) => reference.id === result.id)
    && Boolean(state()?.query?.trim()),
  );

  const updateQuery = (query: string) => controller.primary.updateDerivativeState((current) => ({
    ...(current ?? { visible: true, required: true, trigger: "remix" as const }),
    query,
  }));
  const addReference = (reference: ComposerReference) => {
    controller.primary.updateDerivativeState((current) => ({
      ...(current ?? { visible: true, required: true, trigger: "remix" as const }),
      query: "",
      references: [...(current?.references ?? []), reference],
      sourceTermsAccepted: true,
    }));
  };
  const removeReference = (id: string) => controller.primary.updateDerivativeState((current) => current ? ({
    ...current,
    references: (current.references ?? []).filter((reference) => reference.id !== id),
  }) : current);

  return (
    <Show when={controller.primary.activeSongMode === "remix"}>
      <PostComposerField htmlFor="song-remix-source" label="Source songs" tone="muted">
        <div class="relative">
          <IconMagnifyingGlass class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search source songs"
            class="h-12 rounded-[var(--radius-xl)] bg-card pl-10"
            id="song-remix-source"
            onChange={(event) => updateQuery(event.currentTarget.value)}
            placeholder="Song title or link"
            value={state()?.query ?? ""}
          />
        </div>
        <Show when={suggestions().length > 0}>
          <div class="mt-2 overflow-hidden rounded-[var(--radius-xl)] border border-border-soft bg-card">
            <For each={suggestions()}>
              {(suggestion) => (
                <button class="flex w-full cursor-pointer items-center gap-3 border-b border-border-soft px-3 py-3 text-start last:border-b-0 hover:bg-muted" onClick={() => addReference(suggestion)} type="button">
                  <IconMusicNote class="size-4 text-muted-foreground" />
                  <span class="min-w-0">
                    <Type as="span" variant="body-strong" class="block truncate">{suggestion.title}</Type>
                    <Show when={suggestion.subtitle}>{(subtitle) => <Type as="span" variant="caption" class="block truncate text-muted-foreground">{subtitle()}</Type>}</Show>
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
        <div class="mt-2 space-y-2">
          <For each={references()}>
            {(reference) => (
              <div class="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-[var(--radius-xl)] bg-card p-3">
                <span class="grid size-9 place-items-center rounded-full bg-background"><IconMusicNote class="size-4" /></span>
                <span class="min-w-0">
                  <Type as="span" variant="body-strong" class="block truncate">{reference.title}</Type>
                  <Show when={reference.subtitle}>{(subtitle) => <Type as="span" variant="caption" class="block truncate text-muted-foreground">{subtitle()}</Type>}</Show>
                </span>
                <IconButton aria-label={`Remove ${reference.title}`} class="size-9" onClick={() => removeReference(reference.id)} variant="ghost"><IconX class="size-4" /></IconButton>
              </div>
            )}
          </For>
        </div>
      </PostComposerField>
    </Show>
  );
}

function RoyaltiesStep(props: { controller: PostComposerController }) {
  const controller = props.controller;
  const [collaborator, setCollaborator] = createSignal("");
  const allocations = () => controller.royaltySplit.state.allocations;
  const total = () => allocations().reduce((sum, allocation) => sum + allocation.sharePct, 0);
  const remixingEnabled = () => controller.license.state.presetId === "commercial-remix";

  const addCollaborator = () => {
    const value = collaborator().trim();
    if (!value) return;
    controller.royaltySplit.update((current) => {
      const creator = current.allocations.find((allocation) => allocation.recipientKind === "creator");
      const collaborators = current.allocations.filter((allocation) => allocation.recipientKind !== "creator");
      return {
        allocations: [
          ...(creator ? [{ ...creator, sharePct: Math.max(0, creator.sharePct - 10) }] : []),
          ...collaborators,
          { id: `collaborator-${current.allocations.length}`, recipientKind: "collaborator" as const, walletAddress: value, sharePct: 10 },
        ],
      };
    });
    setCollaborator("");
  };

  const removeCollaborator = (id: string, sharePct: number) => controller.royaltySplit.update((current) => ({
    allocations: current.allocations
      .filter((allocation) => allocation.id !== id)
      .map((allocation) => allocation.recipientKind === "creator" ? { ...allocation, sharePct: allocation.sharePct + sharePct } : allocation),
  }));

  const updateShare = (id: string, sharePct: number) => controller.royaltySplit.update((current) => ({
    allocations: current.allocations.map((allocation) => allocation.id === id ? { ...allocation, sharePct } : allocation),
  }));

  return (
    <div class="space-y-5 px-6 py-6">
      <section>
        <PostComposerSegmentedControl
          aria-label="Song type"
          onChange={(value) => controller.primary.handleSongModeChange(value === "remix" ? "remix" : "original")}
          options={[{ label: "Original", value: "original" }, { label: "Remix", value: "remix" }]}
          value={controller.primary.activeSongMode}
        />
      </section>

      <RemixSourcePicker controller={controller} />

      <PostComposerField htmlFor="song-collaborator" label="Add collaborator" tone="muted">
        <div class="relative">
          <IconMagnifyingGlass class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Add collaborator"
            class="h-12 rounded-[var(--radius-xl)] bg-card pl-10"
            id="song-collaborator"
            onChange={(event) => setCollaborator(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCollaborator(); } }}
            placeholder="name.pirate, name.eth, or 0x..."
            value={collaborator()}
          />
        </div>
      </PostComposerField>

      <div class="space-y-3">
        <For each={allocations()}>
          {(allocation) => {
            const creator = allocation.recipientKind === "creator";
            const label = creator
              ? "You"
              : allocation.walletAddress || "Collaborator";
            return (
              <div
                class={cn(
                  "grid items-center gap-2 rounded-[var(--radius-xl)] bg-card p-3",
                  creator
                    ? "grid-cols-[2.5rem_minmax(0,1fr)_4.5rem]"
                    : "grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_4.5rem]",
                )}
              >
                <Show when={!creator}>
                  <IconButton aria-label={`Remove ${label}`} class="size-9" onClick={() => removeCollaborator(allocation.id, allocation.sharePct)} variant="ghost">
                    <IconX class="size-4" />
                  </IconButton>
                </Show>
                <span class="grid size-9 place-items-center rounded-full bg-background text-sm font-bold">{label.slice(0, 1).toUpperCase()}</span>
                <Type as="span" variant="label" class="truncate">{label}</Type>
                <PostComposerPercentageField
                  aria-label={`${label} royalty share`}
                  onChange={(value) => updateShare(allocation.id, value)}
                  value={allocation.sharePct}
                />
              </div>
            );
          }}
        </For>
        <div class="flex items-center justify-between border-t border-border-soft pt-3">
          <Type as="span" variant="body-strong">Total</Type>
          <Type as="span" variant="body-strong" class={total() === 100 ? "text-success" : "text-destructive"}>{displayPercent(total())}%</Type>
        </div>
      </div>

      <section class="space-y-4 border-t border-border-soft pt-4">
        <div class="grid grid-cols-[1fr_7rem] items-center gap-4">
          <Type as="span" variant="body-strong">Allow others to remix this song</Type>
          <PostComposerSegmentedControl
            aria-label="Allow others to remix this song"
            onChange={(value) => controller.license.update((current) => ({
              ...current,
              commercialRevSharePct: value === "on" ? current.commercialRevSharePct ?? 15 : undefined,
              presetId: value === "on" ? "commercial-remix" : "non-commercial",
            }))}
            options={[{ label: "Off", value: "off" }, { label: "On", value: "on" }]}
            value={remixingEnabled() ? "on" : "off"}
          />
        </div>
        <Show when={remixingEnabled()}>
          <div class="grid grid-cols-[1fr_5.25rem] items-center gap-4">
            <Type as="span" variant="body-strong">Your royalty cut from remixers</Type>
            <PostComposerPercentageField
              aria-label="Royalty cut from remixers"
              onChange={(value) => controller.license.update((current) => ({ ...current, commercialRevSharePct: value }))}
              value={controller.license.state.commercialRevSharePct ?? 15}
            />
          </div>
        </Show>
      </section>
    </div>
  );
}

function ReviewStep(props: { controller: PostComposerController; onEdit: (step: SongFlowStep) => void }) {
  const controller = props.controller;
  const coverUrl = createObjectUrl(() => controller.song.state.coverUpload);
  const [playing, setPlaying] = createSignal(false);
  const collaboratorCount = () => controller.royaltySplit.state.allocations.filter((allocation) => allocation.recipientKind === "collaborator").length;
  const remixCut = () => controller.license.state.presetId === "commercial-remix"
    ? controller.license.state.commercialRevSharePct ?? 15
    : 0;
  const summaryRow = (step: SongFlowStep, title: string, summary: string) => (
    <button class="grid min-h-13 w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[var(--radius-xl)] bg-card px-3.5 py-3 text-start outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => props.onEdit(step)} type="button">
      <Type as="span" variant="body-strong">{step}. {title}</Type>
      <Type as="span" variant="body" class="truncate text-end text-muted-foreground">{summary}</Type>
      <IconCaretRight class="size-4 text-muted-foreground" />
    </button>
  );

  return (
    <div class="space-y-4 px-6 py-6">
      <section class="overflow-hidden rounded-[var(--radius-xl)] bg-card sm:grid sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div class="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-sky-950 via-slate-900 to-amber-950 text-white">
          <Show
            when={coverUrl()}
            fallback={<IconMusicNote class="absolute inset-0 m-auto size-12 text-white/45" />}
          >
            {(src) => <img alt="Song cover" class="h-full w-full object-cover" src={src()} />}
          </Show>
        </div>
        <div class="space-y-3 p-3 sm:flex sm:min-w-0 sm:flex-col sm:justify-center sm:p-5">
          <Type as="div" variant="body-strong" class="truncate">{controller.song.state.title || "Untitled song"}</Type>
          <div class="flex items-center gap-3">
            <Button
              aria-label={playing() ? "Pause song preview" : "Play song preview"}
              class="size-9 shrink-0 rounded-full p-0"
              onClick={() => setPlaying((current) => !current)}
            >
              {playing() ? <IconPause class="size-4" /> : <IconPlay class="ms-0.5 size-4" filled />}
            </Button>
            <span class="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><span class="block h-full w-[18%] bg-primary" /></span>
            <Type as="span" variant="caption" class="shrink-0 tabular-nums text-muted-foreground">3:42</Type>
          </div>
        </div>
      </section>

      <div class="space-y-2">
        {summaryRow(1, "Song", controller.fields.lyricsValue.trim() ? "Lyrics added" : "No lyrics")}
        {summaryRow(2, "Pricing", controller.commerce.monetizationState.visible ? `$${controller.commerce.monetizationState.priceUsd || "0.00"}` : "Free")}
        {summaryRow(3, "Royalties", `${controller.primary.activeSongMode === "remix" ? "Remix" : "Original"} · ${collaboratorCount()} collaborator${collaboratorCount() === 1 ? "" : "s"} · ${remixCut()}%`)}
      </div>
    </div>
  );
}

export function SongUploadFlow(props: {
  controller: PostComposerController;
  initialStep?: SongFlowStep;
  onClose?: () => void;
  onSubmit: () => void;
}) {
  const [step, setStep] = createSignal<SongFlowStep>(props.initialStep ?? 1);
  const title = () => step() === 1 ? "Song" : step() === 2 ? "Pricing" : step() === 3 ? "Royalties" : "Confirm & post";
  const canContinue = () => step() !== 1 || Boolean(props.controller.song.state.primaryAudioUpload || props.controller.song.state.primaryAudioLabel) && Boolean(props.controller.song.state.title?.trim());
  const next = () => setStep((current) => current === 1 ? 2 : current === 2 ? 3 : 4);
  const back = () => {
    if (step() === 1) props.onClose?.();
    else setStep((current) => current === 4 ? 3 : current === 3 ? 2 : 1);
  };

  const footer = () => step() === 4
    ? <PublishButton class="h-12 w-full" controller={props.controller} label="Post" onClick={props.onSubmit} size="lg" />
    : <Button class="h-12 w-full" disabled={!canContinue()} onClick={next}>{step() === 3 ? "Review" : "Continue"}</Button>;

  return (
    <PostComposerPageFrame
      footer={footer()}
      header={<StepHeader controller={props.controller} onBack={back} step={step()} title={title()} />}
    >
      <Show when={step() === 1}><SongStep controller={props.controller} /></Show>
      <Show when={step() === 2}><PricingStep controller={props.controller} /></Show>
      <Show when={step() === 3}><RoyaltiesStep controller={props.controller} /></Show>
      <Show when={step() === 4}><ReviewStep controller={props.controller} onEdit={setStep} /></Show>
    </PostComposerPageFrame>
  );
}
