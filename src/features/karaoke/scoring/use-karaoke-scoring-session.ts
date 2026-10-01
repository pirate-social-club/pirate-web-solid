import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { ScorableKaraokeLine } from "../runtime";
import type { ApiKaraokeSession } from "../runtime/api-contracts";
import { createBrowserMicCaptureDeps } from "../capture/karaoke-mic-capture-browser";
import { KaraokePlaybackGraph } from "../capture/karaoke-playback-graph";
import { KaraokeMicCapture } from "../capture/karaoke-mic-capture";
// A Vite `new URL(..., import.meta.url)` asset for a TypeScript AudioWorklet is
// copied verbatim and inlined as a data URL with a non-JavaScript MIME type, so
// `audioWorklet.addModule` fails in the built application. Asking Vite to bundle
// the worklet as a module URL emits compiled JavaScript instead.
import workletModuleUrl from "../capture/karaoke-capture-processor.ts?worker&url";
import {
  createKaraokeScoringController,
  type KaraokeScoringController,
  type KaraokeScoringState,
} from "./karaoke-scoring-controller";

function resolveWorkletModuleUrl(): URL {
  // Vite rewrites this edge wrapper to the emitted worklet module asset URL.
  return new URL(workletModuleUrl, import.meta.url);
}

type CreateKaraokeSessionApi = (
  communityId: string,
  postId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
) => Promise<ApiKaraokeSession>;

export interface UseKaraokeScoringOptions {
  enabled: boolean;
  communityId: string;
  postId: string;
  scorableLines: readonly ScorableKaraokeLine[];
  createKaraokeSession: CreateKaraokeSessionApi;
  workletModuleUrl?: URL | string;
}

export interface KaraokeScoringControls {
  attachPlaybackElement?(element: HTMLAudioElement | null): void;
  resumePlayback?(): Promise<boolean>;
  start(songMs: number): void;
  noteTime(songMs: number): void;
  notePlay(songMs: number): void;
  notePause(songMs: number): void;
  noteSeek(songMs: number): void;
  noteFinish(songMs: number): void;
  stop(): void;
  abort(code: string): void;
}

export interface UseKaraokeScoringResult {
  enabled: Accessor<boolean>;
  playbackInterrupted: Accessor<boolean>;
  state: Accessor<KaraokeScoringState | null>;
  controls: KaraokeScoringControls;
}

/** Solid lifecycle edge for the framework-neutral karaoke scoring controller. */
export function useKaraokeScoring(
  options: UseKaraokeScoringOptions,
): UseKaraokeScoringResult {
  const [state, setState] = createSignal<KaraokeScoringState | null>(null);
  const [playbackInterrupted, setPlaybackInterrupted] = createSignal(false);
  const playbackGraph = new KaraokePlaybackGraph(undefined, (songMs, contextState) => {
    currentController?.notePause(songMs);
    if (contextState === "closed") {
      setPlaybackInterrupted(false);
      currentController?.abort("karaoke_audio_closed");
    } else if (["active", "reconnecting"].includes(currentController?.getState().status ?? "")) {
      setPlaybackInterrupted(true);
    }
  });
  onCleanup(() => playbackGraph.dispose());
  let playbackElement: HTMLAudioElement | null = null;
  let currentController: KaraokeScoringController | null = null;

  createEffect(
    () => options.enabled,
    (enabled) => {
      if (!enabled) {
        currentController = null;
        setState(null);
        return;
      }

      const controller = createKaraokeScoringController({
        communityId: options.communityId,
        createCaptureEngine: ({ onChunk, onError }) =>
          new KaraokeMicCapture({
            deps: createBrowserMicCaptureDeps(options.workletModuleUrl ?? resolveWorkletModuleUrl(), () => playbackGraph.acquire()),
            onChunk,
            onError,
          }),
        createKaraokeSession: ({ idempotencyKey, signal }) =>
          options.createKaraokeSession(options.communityId, options.postId, idempotencyKey, signal),
        deferCaptureUntilPlaying: true,
        getPlaybackPosition: () => playbackElement ? { songMs: playbackElement.currentTime * 1000, playbackRate: playbackElement.playbackRate } : null,
        postId: options.postId,
        scorableLines: options.scorableLines,
      });
      currentController = controller;
      setState(controller.getState());
      const unsubscribe = controller.subscribe(setState);

      return () => {
        unsubscribe();
        controller.dispose();
        if (currentController === controller) currentController = null;
      };
    },
  );

  const controls: KaraokeScoringControls = {
    attachPlaybackElement: (element) => { playbackElement = element; playbackGraph.attach(element); if (!element) setPlaybackInterrupted(false); },
    resumePlayback: () => playbackGraph.resume(),
    abort: (code) => { setPlaybackInterrupted(false); currentController?.abort(code); },
    noteFinish: (songMs) => { setPlaybackInterrupted(false); currentController?.noteFinish(songMs); },
    notePause: (songMs) => currentController?.notePause(songMs),
    notePlay: (songMs) => {
      if (playbackInterrupted() && !playbackGraph.isRunning()) return;
      setPlaybackInterrupted(false);
      currentController?.notePlay(songMs);
    },
    noteSeek: (songMs) => currentController?.noteSeek(songMs),
    noteTime: (songMs) => { playbackGraph.checkState(); currentController?.noteTime(songMs); },
    start: (songMs) => { setPlaybackInterrupted(false); void currentController?.start(songMs); },
    stop: () => { setPlaybackInterrupted(false); currentController?.stop(); },
  };

  return { controls, enabled: () => options.enabled, playbackInterrupted, state };
}
