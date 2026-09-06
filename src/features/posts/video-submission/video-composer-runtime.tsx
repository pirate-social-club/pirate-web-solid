import { createSignal, onCleanup, Show } from "solid-js";
import { Button, FormNote } from "../../../design-system";
import { OriginalVideoCaptureSurface, OriginalVideoReviewSurface } from "../post-composer/video-original-audio-surface";
import type { VideoCaptureSession } from "./capture";
import { canDiscardRejectedVideo, VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import { createBrowserVideoStorage } from "./storage";
import { createVideoTransport, type VideoTransport } from "./transport";

export function VideoComposerRuntime(props: {
  readonly principalId: string;
  readonly communityId: string;
  readonly personaId?: string;
  readonly onExit: () => void;
  readonly onRetainedPersona: (personaId: string | null) => void;
  readonly onPublished?: () => void;
  readonly storage?: VideoStorage;
  readonly transport?: VideoTransport;
  readonly inspectFile?: (file: File) => Promise<File>;
  readonly fetchImpl?: typeof fetch;
}) {
  const [record, setRecord] = createSignal<PendingVideo | null>(null);
  const [file, setFile] = createSignal<File | null>(null);
  const [caption, setCaption] = createSignal("");
  const [rating, setRating] = createSignal<"general" | "adult_18">("general");
  const [preview, setPreview] = createSignal<string>();
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [progress, setProgress] = createSignal("");
  const [captureStatus, setCaptureStatus] = createSignal<"idle" | "recording" | "camera_denied" | "capability_unavailable" | "orientation_lost">("idle");
  const [stream, setStream] = createSignal<MediaStream | null>(null);
  const mobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse) and (max-width: 767px)").matches;
  let picker: HTMLInputElement | undefined;
  let session: VideoCaptureSession | null = null;
  let disposed = false;
  let publishedId: string | undefined;
  const coordinator = new VideoCoordinator({
    principalId: props.principalId, storage: props.storage ?? createBrowserVideoStorage(props.principalId),
    transport: props.transport ?? createVideoTransport(), fetchImpl: props.fetchImpl,
    onChange: next => {
      if (disposed) return;
      setRecord(next); props.onRetainedPersona(next?.personaId ?? null);
      if (next?.snapshot?.status === "published" && next.snapshot.published_resource.post_id !== publishedId) {
        publishedId = next.snapshot.published_resource.post_id; props.onPublished?.();
      }
    },
    onProgress: (sent, total) => { if (!disposed) setProgress(`Uploaded ${sent} of ${total} bytes`); },
  });
  function showFile(next: File) {
    const previous = preview(); if (previous) URL.revokeObjectURL(previous);
    setFile(next); setPreview(URL.createObjectURL(next));
  }
  async function run<T>(action: () => Promise<T>): Promise<void> {
    if (busy() || disposed) return;
    setBusy(true); setError("");
    try { await action(); } catch (failure) { if (!disposed) setError(failure instanceof Error ? failure.message : "The video attempt could not be completed safely"); }
    finally { if (!disposed) setBusy(false); }
  }
  void coordinator.restore().then(next => {
    if (!next || disposed) return;
    showFile(next.file); setCaption(next.caption); setRating(next.rating);
  }).catch(failure => { if (!disposed) setError(failure instanceof Error ? failure.message : "Video restore failed"); })
    .finally(() => { if (!disposed) setBusy(false); });

  async function chooseFile(next: File | undefined) {
    if (!next || record()) return;
    await run(async () => {
      await session?.cancel(); session = null; setStream(null); setCaptureStatus("idle");
      const accepted = props.inspectFile ? await props.inspectFile(next) : await (await import("./capture")).inspectVideoFile(next);
      if (!disposed) showFile(accepted);
    });
  }
  async function stopCapture() {
    const current = session; if (!current) return;
    await run(async () => {
      session = null;
      try { const take = await current.stop(); if (!disposed) showFile(take); }
      finally { setStream(null); setCaptureStatus("idle"); }
    });
  }
  async function toggleCapture() {
    if (session) { await stopCapture(); return; }
    await run(async () => {
      const capture = await import("./capture");
      try {
        const current = await capture.startOriginalVideoCapture({
          onFailure: failure => {
            session = null;
            if (disposed) return;
            setStream(null); setError(failure.message);
            setCaptureStatus(failure.reason === "orientation_lost" ? "orientation_lost" : "capability_unavailable");
          },
          onLimit: () => { void stopCapture(); },
        });
        if (disposed) { await current.cancel(); return; }
        session = current; setStream(current.stream); setCaptureStatus("recording");
      } catch (failure) {
        if (failure instanceof capture.VideoCaptureError) setCaptureStatus(failure.reason === "camera_denied" ? "camera_denied" : "capability_unavailable");
        throw failure;
      }
    });
  }
  async function publish() {
    await run(async () => {
      const retained = coordinator.current;
      if (retained && (retained.communityId !== props.communityId || retained.personaId !== props.personaId)) throw new Error("Resolve this retained video with its original community and persona");
      if (!retained) {
        const selected = file(); if (!selected || !props.personaId || !props.communityId) throw new Error("Choose a community, persona and compatible video");
        await coordinator.begin({ communityId: props.communityId, personaId: props.personaId, file: selected, caption: caption(), rating: rating() });
      }
      await coordinator.submit();
    });
  }
  const poll = setInterval(() => {
    const state = record()?.snapshot;
    if ((state?.status === "manual_review" || (state?.status === "processing" && state.phase !== "awaiting_upload")) && !busy()) void run(() => coordinator.refresh());
  }, 3_000);
  onCleanup(() => {
    disposed = true; clearInterval(poll); coordinator.pauseUpload();
    void session?.cancel(); session = null;
    const url = preview(); if (url) URL.revokeObjectURL(url);
  });
  const state = () => record()?.snapshot;
  const failure = () => { const snapshot = state(); return snapshot?.status === "processing_failed" ? snapshot : undefined; };
  const editing = () => !record();
  const awaiting = () => { const snapshot = state(); return snapshot?.status === "processing" && snapshot.phase === "awaiting_upload"; };
  const publishedHref = () => {
    const snapshot = state(); if (snapshot?.status !== "published") return undefined;
    const url = new URL(snapshot.published_resource.href, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}` : undefined;
  };
  return <section class="grid gap-3" aria-label="Original-audio video composer">
    <input ref={element => { picker = element; }} hidden type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <Show when={error()}>{message => <FormNote tone="warning">{message()}</FormNote>}</Show>
    <Show when={busy()}><p role="status">{progress() || "Preparing video…"}</p></Show>
    <Show when={editing() && !file()}>
      <div inert={busy()}>
        <OriginalVideoCaptureSurface channel={mobile ? "camera" : "upload"} status={captureStatus()}
          onClose={props.onExit} onUpload={() => picker?.click()} onRecordToggle={() => { void toggleCapture(); }}
          onRetake={() => { setError(""); setCaptureStatus("idle"); }}
          preview={<Show when={stream()}>{source => <video ref={element => { element.srcObject = source(); }} autoplay muted playsinline class="h-full w-full object-cover" />}</Show>} />
      </div>
    </Show>
    <Show when={editing() && file()}>
      <label><input type="checkbox" checked={rating() === "adult_18"} disabled={busy()} onChange={event => setRating(event.currentTarget.checked ? "adult_18" : "general")} /> This video is for adults (18+)</label>
      <OriginalVideoReviewSurface caption={caption()} onCaptionChange={setCaption} submitting={busy()} onPublish={() => { void publish(); }}
        onBack={() => { if (!busy()) { setFile(null); const url = preview(); if (url) URL.revokeObjectURL(url); setPreview(undefined); } }}
        preview={<video src={preview()} controls playsinline class="h-full w-full object-contain" />} />
    </Show>
    <Show when={record()}>
      <p role="status">Video state: {record()?.rejection ? "request rejected" : state()?.status.replaceAll("_", " ") ?? "reservation pending"}.</p>
      <Show when={record()?.rejection}><p role="alert">The video request was rejected. A new attempt will not start automatically.</p></Show>
      <Show when={canDiscardRejectedVideo(record())}><Button disabled={busy()} onClick={() => { void run(async () => {
        const rejected = await coordinator.discardRejected(); showFile(rejected.file); setCaption(rejected.caption); setRating(rejected.rating);
      }); }}>Edit rejected video</Button></Show>
      <Show when={state()?.status === "manual_review"}><p>Your video remains private during review. No post is public yet.</p></Show>
      <Show when={state()?.status === "blocked" || state()?.status === "abandoned"}><p>This attempt cannot publish. It will not be retried with a new identity.</p></Show>
      <Show when={!record()?.rejection && (record()?.pending || awaiting() || !state())}><Button disabled={busy()} onClick={() => { void publish(); }}>Resume video submission</Button></Show>
      <Show when={awaiting() && Date.parse(record()?.reservation?.upload.expires_at ?? "") <= Date.now()}><p role="status">This upload reservation has expired. Cancel this submission, then select the source again for a new video.</p></Show>
      <Show when={awaiting()}><Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("cancel")); }}>Cancel video submission</Button></Show>
      <Show when={busy()}><Button onClick={() => coordinator.pauseUpload()}>Pause upload</Button></Show>
      <Show when={failure()?.reason_code === "provider_submission_unconfirmed"}><p role="status">The provider submission is unconfirmed. We need to reconcile it before another attempt is safe.</p></Show>
      <Show when={failure()?.reason_code === "membership_required"}><p role="status">Restore your community posting eligibility, then retry publication. Your completed analysis is retained.</p></Show>
      <Show when={failure()?.retryable}><Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("retry")); }}>{failure()?.reason_code === "membership_required" ? "Retry publication" : "Retry processing"}</Button></Show>
      <Button disabled={busy()} onClick={() => { void run(() => coordinator.refresh()); }}>Check video status</Button>
      <Show when={publishedHref()}>{href => <a href={href()}>View published post</a>}</Show>
      <Show when={state() && ["published", "blocked", "abandoned"].includes(state()!.status)}>
        <Button disabled={busy()} onClick={() => { void run(async () => { await coordinator.discard(); setFile(null); const url = preview(); if (url) URL.revokeObjectURL(url); setPreview(undefined); setCaption(""); }); }}>Start a new video</Button>
      </Show>
    </Show>
  </section>;
}
