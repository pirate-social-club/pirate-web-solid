import { createSignal, Show } from "solid-js";
import { Button, FormNote, IconArrowLeft, IconButton, IconX, Input, Textarea, Type } from "../../../design-system";
import { SongTermsEditor } from "../media-submission/song-terms-editor";
import { extractEmbeddedAudioArtworkFile, extractEmbeddedAudioTitle } from "./audio-artwork";
import type { PostComposerController } from "./controller";
import { PostComposerPageFrame } from "./form-shell";
import { PostComposerIdentityControl } from "./identity-control";
import { validateSongComposerTerms } from "./media-composer-bridge";
import { PostComposerPublishControls } from "./publish-controls";
import { SongAudioPreview } from "./song-audio-preview";
import { PublishButton } from "./submit-actions";
import type { SongFlowRuntime } from "./types";

type SongFlowStep = 1 | 2 | 3 | 4;
const titles = ["Song", "Lyrics", "Royalties", "Confirm & post"] as const;

export function SongUploadFlow(props: {
  controller: PostComposerController;
  initialStep?: SongFlowStep;
  runtime?: SongFlowRuntime;
  onClose?: () => void;
  onSubmit: () => void;
}) {
  const controller = props.controller;
  const [step, setStep] = createSignal<SongFlowStep>(props.initialStep ?? 1);
  const [preparing, setPreparing] = createSignal(false);
  const [error, setError] = createSignal("");
  const [readingFile, setReadingFile] = createSignal(false);
  const locked = () => props.runtime?.locked === true;
  const audioLocked = () => props.runtime?.retained === true;
  const lyricsReady = () => props.runtime ? props.runtime.prepared : controller.song.state.lyricsEditorState === "ready";
  const termsError = () => {
    try { validateSongComposerTerms(controller.royaltySplit.state, props.runtime?.personaId ?? controller.royaltySplit.state.allocations.find(row => row.recipientKind === "creator")?.recipientId ?? ""); return ""; }
    catch (error) { return error instanceof Error ? error.message : "Check the royalty recipients and shares."; }
  };
  let fileSelection = 0;
  async function selectFile(file: File | undefined) {
    if (!file || audioLocked()) return;
    const selection = ++fileSelection;
    if (file.type !== "audio/mpeg" || !file.name.toLowerCase().endsWith(".mp3")) {
      setError("Choose an MP3 audio file."); return;
    }
    setError(""); setReadingFile(true);
    try {
      const [title, artwork] = await Promise.all([extractEmbeddedAudioTitle(file), extractEmbeddedAudioArtworkFile(file)]);
      if (selection !== fileSelection || audioLocked()) return;
      controller.song.update(current => ({ ...current, primaryAudioUpload: file, primaryAudioLabel: file.name,
        title: current.title?.trim() || title || file.name.replace(/\.mp3$/iu, ""),
        coverUpload: artwork, coverSource: artwork ? "embedded" : undefined, lyricsEditorState: "hidden" }));
    } catch { setError("The audio file could not be read. Choose it again."); }
    finally { if (selection === fileSelection) setReadingFile(false); }
  }
  async function next() {
    if (preparing() || locked()) return;
    setError("");
    if (step() === 1 && props.runtime && !props.runtime.prepared) {
      setPreparing(true);
      try { if (!await props.runtime.prepare()) return; }
      catch (error) { setError(error instanceof Error ? error.message : "The audio could not be prepared."); return; }
      finally { setPreparing(false); }
    }
    if (step() === 3 && termsError()) { setError(termsError()); return; }
    setStep(current => current === 1 ? 2 : current === 2 ? 3 : 4);
  }
  const cannotContinue = () => preparing() || readingFile() || locked() || controller.submit.loading
    || (step() === 1 && props.runtime && !props.runtime.personaId)
    || (step() === 1 && (!controller.song.state.primaryAudioUpload || !controller.song.state.title?.trim()))
    || (step() === 2 && !lyricsReady())
    || (step() === 3 && termsError() !== "");
  const preview = () => <SongAudioPreview audio={controller.song.state.primaryAudioUpload}
    artwork={controller.song.state.coverSource === "embedded" ? controller.song.state.coverUpload : null}
    title={controller.song.state.title} />;
  return <PostComposerPageFrame embedded={props.runtime !== undefined}
    header={<div class="flex items-center gap-3">
      <IconButton aria-label={step() === 1 ? "Close song upload" : "Previous step"} variant="ghost"
        disabled={preparing()} onClick={() => step() === 1 ? props.onClose?.() : setStep(current => current === 4 ? 3 : current === 3 ? 2 : 1)}>
        {step() === 1 ? <IconX class="size-5" /> : <IconArrowLeft class="size-5" />}
      </IconButton>
      <Type as="h2" variant="h3">{titles[step() - 1]}</Type>
      <Type as="span" variant="caption">{step()} of 4</Type>
      <PostComposerPublishControls controller={controller} presentation="icon" />
      <PostComposerIdentityControl controller={controller} presentation="icon" />
    </div>}
    footer={step() === 4
      ? <PublishButton class="h-12 w-full" controller={controller} label="Publish song" onClick={() => {
        if (termsError()) { setError(termsError()); return; } props.onSubmit();
      }} />
      : <Button class="h-12 w-full" disabled={cannotContinue()} loading={preparing()} onClick={() => void next()}>
        {step() === 1 && props.runtime && !props.runtime.prepared ? "Upload and continue" : step() === 3 ? "Review" : "Continue"}
      </Button>}
  >
    <div class="space-y-4 p-6">
      <Show when={error()}><FormNote tone="warning">{error()}</FormNote></Show>
      <Show when={controller.submit.error}><FormNote tone="warning">{controller.submit.error}</FormNote></Show>
      <Show when={step() === 1}>
        {preview()}
        <Type as="p" variant="caption">{controller.song.state.primaryAudioLabel}</Type>
        <Show when={!audioLocked()}><Button aria-label="Remove audio" variant="ghost" onClick={() => {
          controller.song.update(current => ({ ...current, primaryAudioUpload: null, primaryAudioLabel: undefined }));
          controller.tabs.onTabChange("text");
        }}>Remove audio</Button></Show>
        <label class="grid gap-2">Audio file
          <input aria-label="Song audio file" type="file" accept="audio/mpeg,.mp3" disabled={audioLocked() || preparing()}
            onChange={event => void selectFile(event.currentTarget.files?.[0])} />
        </label>
        <label class="grid gap-2">Song title
          <Input aria-label="Song title" maxlength={300} disabled={audioLocked() || preparing()} value={controller.song.state.title ?? ""}
            onChange={event => controller.song.update(current => ({ ...current, title: event.currentTarget.value }))} />
        </label>
        <Type as="p" variant="caption">Upload your original song. Uploading saves your audio; it does not publish your post.</Type>
      </Show>
      <Show when={step() === 2}>
        <Show when={lyricsReady()} fallback={<FormNote>Finish uploading your audio before adding lyrics.</FormNote>}>
          <label class="grid gap-2">Lyrics (optional)
            <Textarea aria-label="Lyrics (optional)" maxlength={10_000} disabled={locked()} value={controller.fields.lyricsValue}
              onChange={event => controller.fields.onLyricsValueChange?.(event.currentTarget.value)} />
          </label>
          <Type as="p" variant="caption">Review the words you wrote or pasted. They will be saved before your song is published. Leave this blank to post without lyrics.</Type>
        </Show>
      </Show>
      <Show when={step() === 3}>
        <fieldset disabled={locked()}>
          <SongTermsEditor license={controller.license.state.presetId}
            commercialRevShareBps={controller.license.state.commercialRevShareBps ?? 1_000}
            allocations={controller.royaltySplit.state}
            onLicenseChange={presetId => controller.license.update(current => ({ ...current, presetId }))}
            onCommercialRevShareBpsChange={commercialRevShareBps => controller.license.update(current => ({ ...current, commercialRevShareBps }))}
            onAllocationsChange={allocations => controller.royaltySplit.update(() => allocations)} />
        </fieldset>
        <Show when={termsError()}><FormNote tone="warning">{termsError()}</FormNote></Show>
      </Show>
      <Show when={step() === 4}>
        {preview()}
        <Type as="p">{controller.fields.lyricsValue.trim() ? "Your reviewed lyrics will be included." : "Posting without lyrics. Study and Karaoke will be unavailable."}</Type>
        <Type as="p">License: {controller.license.state.presetId.replaceAll("-", " ")}</Type>
        <Type as="p">{controller.royaltySplit.state.allocations.length} royalty recipient(s)</Type>
      </Show>
    </div>
  </PostComposerPageFrame>;
}
