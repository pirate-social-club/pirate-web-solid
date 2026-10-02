import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { isServer } from "@solidjs/web";
import { ActionFooterShell, Button, buttonVariants, cn, FormNote, MobilePageHeader, Spinner } from "../../../design-system";
import { SongExcerptComposer } from "../post-composer/song-excerpt-composer";
import { OriginalVideoCaptureSurface, OriginalVideoReviewSurface } from "../post-composer/video-original-audio-surface";
import { songLengthForClip } from "./clip-duration";
import { isRetainedVersion } from "./coordinator";
import { useVideoComposerSession, type VideoComposerSessionProps } from "./video-composer-session";
import { SongReviewPreview } from "./song-review-preview";
import { createBrowserVideoStorage } from "./storage";
export type { VideoPostingOption } from "./video-composer-session";
export type { GuideAudio } from "./video-composer-media";
export { GUIDE_BUFFER_TIMEOUT_MS, GUIDE_START_TIMEOUT_MS, GUIDE_START_MAX_DELAY_MS, excerptBuffered } from "./video-composer-media";

/** Resolve identity before mounting song choice or capture. A retained upload
 * keeps its original identity and remains recoverable even without an active
 * profile on the current page. No profile choice is made inside this flow. */
export function VideoComposerRuntime(props: Parameters<typeof VideoComposerSession>[0]) {
  const entry = untrack(() => {
    const personaId = props.personaId?.trim();
    const communityId = props.communityId?.trim();
    const eligible = props.personaOptions?.filter(option => !option.communityId || option.communityId === communityId);
    return { communityId, principalId: props.principalId, hasProfiles: eligible === undefined || eligible.length > 0, ready: Boolean(personaId) && (eligible === undefined || eligible.some(option => option.id === personaId)) };
  });
  const storage = untrack(() => props.storage ?? createBrowserVideoStorage(props.principalId));
  const [clientReady, setClientReady] = createSignal(false);
  const [admitted, setAdmitted] = createSignal(entry.ready, { ownedWrite: true });
  // The page may still be resolving its active profile. Accept it before the
  // session mounts, then keep that session even if the shell profile changes.
  createEffect(() => {
    if (admitted()) return true;
    const personaId = props.personaId?.trim();
    const eligible = props.personaOptions?.filter(option => !option.communityId || option.communityId === props.communityId?.trim());
    return Boolean(personaId) && (eligible === undefined || eligible.some(option => option.id === personaId));
  }, ready => { if (ready) setAdmitted(true); });
  const [retained, setRetained] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [failed, setFailed] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const checkRetained = async () => {
    if (disposed) return;
    setChecking(true); setFailed(false);
    try {
      const previous = await storage.exclusive(() => storage.load());
      if (previous !== null && (previous.principalId !== entry.principalId || !isRetainedVersion(previous))) throw new Error("Stored video could not be restored");
      if (!disposed) setRetained(previous !== null);
    } catch { if (!disposed) setFailed(true); }
    finally { if (!disposed) setChecking(false); }
  };
  if (!isServer) queueMicrotask(() => {
    if (disposed) return;
    setClientReady(true);
    if (entry.ready) setChecking(false);
    else void checkRetained();
  });
  return <Show when={clientReady() && (admitted() || retained())} fallback={
    <ActionFooterShell fullViewport header={<MobilePageHeader class="relative z-10" title="Create video" onBackClick={props.onExit} />}
      footer={<Show when={!checking()}><div class="mx-auto w-full max-w-md">
        <Show when={failed()} fallback={entry.communityId
          ? <a class={cn(buttonVariants(), "w-full")} href={`/c/${encodeURIComponent(entry.communityId)}`}>Open community</a>
          : <Button class="w-full" onClick={props.onExit}>Back</Button>}>
          <Button class="w-full" onClick={() => { void checkRetained(); }}>Try again</Button>
        </Show>
      </div></Show>}>
      <div class="mx-auto grid w-full max-w-md gap-4 p-4" data-video-entry-prerequisite>
        <Show when={checking()} fallback={<p role={failed() ? "alert" : "status"}>{failed()
          ? "Your video couldn’t load. Try again."
          : entry.communityId ? entry.hasProfiles ? "Choose your profile on the community page." : "You need a profile in this community to create a video." : "Choose a community and profile before creating a video."}</p>}>
          <Spinner label="Preparing video" />
        </Show>
      </div>
    </ActionFooterShell>
  }><VideoComposerSession {...props} storage={storage} /></Show>;
}

function VideoComposerSession(props: VideoComposerSessionProps) {
  const flow = useVideoComposerSession(props);
  const {
    mobile, excerptStore, songPreflight, personasForDestination, chosenCommunityId, chosenPersonaId,
    preview, originalPreview, stream, viewfinderStalled, bindViewfinder, playLive,
    record, file, submittedFromReview, busy, error, progress, captureStatus, selection,
    clipDurationMs, measuring, finalizing, songPlan, songSheetOpen,
    takeAlignment, confirmingSound, checkingPlayback, playbackFailed, panelShown,
    songActive, songSheetTitle, songLabel, approvedSelection, clipProblem, takeMismatch,
    profileReady, interactionBusy, editing, reservationExpired, otherDestination,
    reviewVisible, completedUpload, statusText, posted, clearPreviewUrls, openSongSheet,
    confirmSound, chooseFile, toggleCapture, publish, send,
  } = flow;
  let picker: HTMLInputElement | undefined;
  let viewfinder: HTMLVideoElement | undefined;
  /** The states the author must know about before recording, shown over the
   * capture view. Pending checks are machinery, not information: they say
   * nothing here and surface only on the sound sheet's confirm action. */
  const captureNotice = () => {
    if (file()) return undefined;
    if (busy() && progress()) return <div class="flex justify-center"><Spinner label={progress().replace(/…$/, "")} /></div>;
    if (finalizing()) return <div class="flex justify-center"><Spinner label="Finishing video" /></div>;
    if (!panelShown() && error()) return <FormNote class="rounded-[var(--radius-lg)] bg-black/70 px-3 py-2" tone="warning">{error()}</FormNote>;
    if (props.personaOptions !== undefined && personasForDestination().length === 0) {
      return <p class="rounded-[var(--radius-lg)] bg-black/60 px-3 py-2 text-center text-sm text-white" role="status">Choose a posting profile for this community.</p>;
    }
    if (chosenPersonaId() === "") return <p class="rounded-[var(--radius-lg)] bg-black/60 px-3 py-2 text-center text-sm text-white" role="status">Choose a profile before recording.</p>;
    return undefined;
  };
  return <section class="grid gap-3" aria-label="Video composer">
    <input ref={element => { picker = element; }} hidden type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />

    <Show when={editing()}>
      {/* Capture carries the chosen song and a way to change it. */}
      <Show when={!file() && !songSheetOpen()}>
      <div inert={interactionBusy()}>
        <Show when={captureStatus() === "recording"}>
          <p role="status" class="sr-only">{selection()
            ? `Recording to ${selection()!.title}. Recording ends with the song.`
            : "Recording."}</p>
        </Show>
        <OriginalVideoCaptureSurface channel={mobile ? "camera" : "upload"} status={captureStatus()}
          songLabel={songLabel()} onSongTap={openSongSheet}
          onClose={props.onExit} onBack={openSongSheet} onUpload={() => picker?.click()} onRecordToggle={() => { void toggleCapture(); }}
          onRetake={() => send({ type: "RETAKE" })}
          notice={captureNotice()}
          preview={<>
            <video ref={element => { viewfinder = element; bindViewfinder(element); }} autoplay muted playsinline
              class={stream() ? "h-full w-full object-cover" : "hidden"} />
            <Show when={stream() && viewfinderStalled()}>
              <button type="button" data-video-viewfinder-resume
                class="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-[var(--radius-lg)] bg-black/70 px-4 py-2 text-sm text-white"
                onClick={() => { if (viewfinder) playLive(viewfinder); }}>
                Resume camera preview
              </button>
            </Show>
          </>} />
      </div>
      </Show>
      {/* Full-screen song choice stays mounted while hidden so a draft and its
          current eligibility verdict remain available at review. */}
      <div
        aria-hidden={songSheetOpen() ? undefined : "true"}
        aria-label={songSheetTitle()}
        aria-modal="true"
        inert={!songSheetOpen()}
        class={cn(
          "fixed inset-0 z-50 overflow-hidden bg-background",
          songSheetOpen() ? "" : "pointer-events-none invisible",
        )}
        data-song-choice-screen
        role="dialog"
      >
        <ActionFooterShell
          fullViewport
          header={<MobilePageHeader class="relative z-10" title={songSheetTitle()}
            onBackClick={() => send({ type: "BACK_FROM_SONG" })} />}
          footerClass={selection() && ["ready", "checking", "measuring"].includes(songPlan().kind) ? undefined : "hidden"}
          footer={<Show when={selection() && ["ready", "checking", "measuring"].includes(songPlan().kind)}>
            <div class="mx-auto w-full max-w-md">
              <Button class="w-full" disabled={confirmingSound() || checkingPlayback() || !profileReady()}
                loading={confirmingSound() || checkingPlayback()} onClick={confirmSound} type="button">{playbackFailed() ? "Try again" : "Continue to video"}</Button>
            </div>
          </Show>}
        >
        <div class="mx-auto grid min-w-0 w-full max-w-md grid-cols-1 gap-5 p-4">
          <h1 class="sr-only">{songSheetTitle()}</h1>
          <Show when={!profileReady()}><FormNote tone="warning">Choose your active community profile before creating a video.</FormNote></Show>
          <Show when={songSheetOpen() && error()}>{message => <FormNote tone="warning">{message()}</FormNote>}</Show>
          <fieldset class="contents" disabled={captureStatus() === "recording" || finalizing()}>
          <section aria-label="Soundtrack" class="min-w-0">
            <SongExcerptComposer store={excerptStore} read={props.songReader} communityId={chosenCommunityId() || undefined}
              personaId={chosenPersonaId() || undefined}
              disabled={captureStatus() === "recording" || finalizing()}
              clipLengthMs={songLengthForClip(clipDurationMs())}
              preflight={songPreflight} initialSong={props.initialSong}
              {...(props.songPicker === undefined ? {} : { songs: props.songPicker })}
              onPlan={plan => send({ type: "SONG_PLAN", plan })}
              onChoice={choice => send({ type: "SONG_CHOICE", choice })}
              onSource={source => send({ type: "SONG_SOURCE", source })}
              onSelection={next => send({ type: "SELECTION", selection: next })} />
          </section>
          </fieldset>
        </div>
        </ActionFooterShell>
      </div>
    </Show>
    <Show when={reviewVisible()}>
      <OriginalVideoReviewSurface submitting={busy()} submitLabel={busy() && submittedFromReview() ? progress().replace("video…", "video") || "Uploading video" : submittedFromReview() && record() ? "Try upload again" : "Publish video"} publishDisabled={!record() && (!profileReady() || approvedSelection() === undefined || measuring() || finalizing() || takeMismatch() || takeAlignment() === "unaligned" || clipProblem() !== undefined)} notice={(error() && record() ? "Your video couldn’t upload. Try again." : error()) || clipProblem() || (takeMismatch() ? "The song changed. Record a new video." : undefined) || (takeAlignment() === "unaligned" ? "The video couldn’t play in time with the song. Record again." : undefined)} onPublish={() => { void publish(); }}
        onBack={() => { if (record()) props.onExit(); else if (!busy()) { clearPreviewUrls(); send({ type: "BACK_FROM_REVIEW" }); } }}
        preview={songActive() && songPlan().kind === "ready" && selection() && takeAlignment() !== "unaligned"
          ? <SongReviewPreview audioUrl={selection()!.audioUrl} bounds={selection()!.bounds} videoUrl={preview()}
              createAudio={props.createGuideAudio} disabled={busy()} />
          : <video src={originalPreview() ?? preview()} controls={!songActive()} playsinline class="h-full w-full object-contain" />}
        songLabel={songLabel()} onSongTap={record() ? undefined : openSongSheet}
        details={<div class="grid gap-3">
        <Show when={finalizing()}>
          <Spinner label="Preparing video" />
        </Show>
        </div>} />
    </Show>
    <Show when={record() && !reviewVisible()}>
      <ActionFooterShell class="bg-background text-foreground" fullViewport header={<MobilePageHeader class="relative z-10" title="Upload video" onBackClick={props.onExit} />}
        footer={<div class="mx-auto w-full max-w-md">
          <Show when={otherDestination()} fallback={
            <Button class="w-full" disabled={busy()} loading={busy()} onClick={() => {
              if (completedUpload()) posted();
              else if (reservationExpired() || record()?.rejection) send({ type: "START_OVER" });
              else void publish();
            }}>{busy() ? "Uploading" : completedUpload() ? "Home" : reservationExpired() || record()?.rejection ? "Start over" : "Try again"}</Button>
          }>
            <a class={cn(buttonVariants(), "w-full")} href={`/c/${encodeURIComponent(record()!.communityId)}`}>Open community</a>
          </Show>
        </div>}>
        <div class="mx-auto grid w-full max-w-md gap-4 p-4">
          <Show when={busy()}><Spinner label="Uploading video" /></Show>
          <p role={record()?.rejection ? "alert" : "status"}>{statusText()}</p>
        </div>
      </ActionFooterShell>
    </Show>
  </section>;
}
