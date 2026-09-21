// Song step: the song's identity first — artwork beside the title — then the
// audio, an optional lyrics field, and whether this is an original or a remix.
// The audio file is the only hard requirement; the title is prefilled from ID3
// or the filename and stays editable.

import { createSignal, Show } from "solid-js";

import {
  Button,
  CardContent,
  Checkbox,
  CheckboxLabel,
  IconCaretDown,
  IconImage,
  IconMusicNote,
  IconUploadSimple,
  Input,
  OptionCard,
  OptionCardGroup,
  Textarea,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { PUBLIC_SONG_LYRICS_MAX_CHARACTERS, publicSongAudioIssue } from "../media-submission/contracts";
import { extractEmbeddedAudioArtworkFile, extractEmbeddedAudioTitle } from "./audio-artwork";
import { PostComposerAttachmentCard } from "./attachment-card";
import { FieldLabel } from "./fields";
import { createObjectUrl } from "./media-hooks";
import type { PostComposerController } from "./controller";
import type { SongFlowRuntime } from "./types";

function titleFromFilename(name: string): string {
  const index = name.lastIndexOf(".");
  return (index > 0 ? name.slice(0, index) : name).trim();
}

export function SongStep(props: {
  controller: PostComposerController;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const coverPreview = createObjectUrl(() => song().coverUpload);
  const [dragging, setDragging] = createSignal(false);
  const [readingFile, setReadingFile] = createSignal(false);
  const [fileError, setFileError] = createSignal<string | null>(null);
  const [lyricsExpanded, setLyricsExpanded] = createSignal(false);
  const lyricsOpen = () => lyricsExpanded() || controller.fields.lyricsValue.trim() !== "";
  const audioLocked = () => props.runtime?.retained === true;
  let dragCounter = 0;
  let audioInput: HTMLInputElement | undefined;

  const attachment = () => {
    const upload = song().primaryAudioUpload;
    const label = upload?.name ?? song().primaryAudioLabel;
    return label?.trim() ? { kind: "song", label, artworkUrl: coverPreview() } as const : null;
  };

  let fileSelection = 0;
  async function selectFile(file: File | undefined) {
    if (!file || audioLocked()) return;
    const selection = ++fileSelection;
    const issue = publicSongAudioIssue(file);
    if (issue !== null) {
      setFileError(issue);
      return;
    }
    setFileError(null);
    setReadingFile(true);
    try {
      const [embeddedTitle, artwork] = await Promise.all([
        extractEmbeddedAudioTitle(file),
        extractEmbeddedAudioArtworkFile(file),
      ]);
      if (selection !== fileSelection || audioLocked()) return;
      controller.song.update(current => ({
        ...current,
        primaryAudioUpload: file,
        primaryAudioLabel: file.name,
        title: current.title?.trim() || embeddedTitle || titleFromFilename(file.name),
        coverUpload: artwork,
        coverLabel: artwork?.name,
        coverSource: artwork ? "embedded" : undefined,
        lyricsEditorState: "hidden",
      }));
    } catch {
      setFileError("The audio file could not be read. Choose it again.");
    } finally {
      if (selection === fileSelection) setReadingFile(false);
    }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragCounter = 0;
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void selectFile(file);
  };

  const removeAudio = () => {
    controller.song.update((state) => ({
      ...state,
      primaryAudioUpload: null,
      primaryAudioLabel: undefined,
    }));
    // Removing the audio returns to the text composer, matching the entry
    // that selected it: with no song attached there is nothing to review.
    controller.tabs.onTabChange("text");
  };

  return (
    <CardContent
      class={cn(
        "relative space-y-6 p-8",
        controller.isMobile() && "px-0 pb-4 pt-1",
        dragging() && "overflow-hidden",
      )}
      onDragEnter={(event) => { event.preventDefault(); dragCounter += 1; setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); dragCounter -= 1; if (dragCounter <= 0) setDragging(false); }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <Type as="h2" variant="h3">{controller.copy.steps.song}</Type>
      <Show when={dragging()}>
        <div class="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-primary bg-primary-subtle/80">
          <div class="flex flex-col items-center gap-3">
            <IconUploadSimple class="size-10 text-primary" />
            <Type as="p" variant="body-strong" class="text-primary">Drop a song to attach it</Type>
          </div>
        </div>
      </Show>

      <section class="flex items-start gap-4">
        <Show
          when={coverPreview()}
          fallback={
            <div class="grid size-24 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-border-soft bg-muted/20 text-muted-foreground">
              <span class="flex flex-col items-center gap-1">
                <IconImage class="size-6" />
                <Type as="span" variant="caption">Artwork from audio</Type>
              </span>
            </div>
          }
        >
          {(url) => (
            <div class="relative size-24 shrink-0">
              <img
                alt=""
                class="size-24 rounded-[var(--radius-lg)] border border-border-soft object-cover"
                src={url()}
              />
            </div>
          )}
        </Show>
        <div class="min-w-0 flex-1 space-y-2">
          <FieldLabel htmlFor="song-track-title" label="Song title" required />
          <Input
            id="song-track-title"
            disabled={audioLocked() || readingFile()}
            maxlength={300}
            onChange={(event) => controller.song.update((current) => ({ ...current, title: event.currentTarget.value }))}
            placeholder="Song title"
            value={song().title ?? ""}
          />
        </div>
      </section>

      <section class="space-y-3">
        <FieldLabel label="Audio" required />
        <Show
          when={attachment()}
          fallback={
            <Show when={audioLocked()} fallback={
            <button
              class="grid w-full cursor-pointer place-items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-border-soft bg-muted/20 px-4 py-10 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => audioInput?.click()}
              type="button"
            >
              <IconMusicNote class="size-8" />
              <Type as="span" variant="body-strong">Add audio</Type>
            </button>
            }>
              <Type as="p" variant="caption" class="text-muted-foreground">
                {props.runtime?.prepared
                  ? "Audio is retained by the server; the browser file is unavailable."
                  : "The browser audio file is unavailable. Cancel this submission to start again."}
              </Type>
            </Show>
          }
        >
          <PostComposerAttachmentCard
            attachment={attachment()!}
            onChange={() => undefined}
            onRemove={removeAudio}
            onReplace={() => audioInput?.click()}
          />
        </Show>
        <Show when={fileError()}>
          <Type as="p" variant="caption" class="text-destructive-text">{fileError()}</Type>
        </Show>
      </section>

      <section class="space-y-3">
        <Button
          aria-expanded={lyricsOpen() ? "true" : "false"}
          class="px-0 text-foreground"
          onClick={() => setLyricsExpanded((current) => !current)}
          size="sm"
          variant="ghost"
        >
          <IconCaretDown class={cn("size-4 transition-transform", lyricsOpen() && "rotate-180")} />
          {lyricsOpen() ? controller.copy.fields.hideLyrics : controller.copy.fields.addLyrics}
        </Button>
        <Show when={lyricsOpen()}>
          <Textarea
            aria-label="Lyrics"
            class="min-h-48 resize-y"
            disabled={audioLocked()}
            maxlength={PUBLIC_SONG_LYRICS_MAX_CHARACTERS}
            onChange={(event) => controller.fields.onLyricsValueChange?.(event.currentTarget.value)}
            placeholder="Add lyrics (optional)"
            value={controller.fields.lyricsValue}
          />
        </Show>
      </section>

      <section class="space-y-3">
        <Checkbox
          aria-label="18+ content"
          checked={controller.audience.ageGatePolicy === "18_plus"}
          disabled={controller.audience.editingDisabled}
          onChange={(checked) => controller.audience.setAgeGatePolicy(checked === true ? "18_plus" : "none")}
        >
          <CheckboxLabel class="grid gap-1">
            <span>18+ content</span>
            <span class="font-normal text-muted-foreground">
              Mark this song for adults if its audio, lyrics, or artwork contains adult content.
            </span>
          </CheckboxLabel>
        </Checkbox>
      </section>

      <section class="space-y-3">
        <FieldLabel label={controller.copy.rights.songKind} />
        <OptionCardGroup
          disabled={audioLocked()}
          label={controller.copy.rights.songKind}
          onChange={(value) => controller.primary.handleSongModeChange(value === "remix" ? "remix" : "original")}
          value={controller.primary.activeSongMode}
        >
          <OptionCard title={controller.copy.songModes.original} value="original" />
          <OptionCard
            disabled
            disabledHint="Remix publishing is not available yet."
            title={controller.copy.songModes.remix}
            value="remix"
          />
        </OptionCardGroup>
      </section>

      <input
        accept=".mp3,audio/mpeg"
        aria-label="Upload audio"
        class="sr-only"
        disabled={audioLocked() || readingFile()}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void selectFile(file);
          event.currentTarget.value = "";
        }}
        ref={audioInput}
        type="file"
      />
    </CardContent>
  );
}
