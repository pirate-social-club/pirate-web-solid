import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { ScorableKaraokeLine } from "../runtime";
import type { ApiKaraokeSession } from "../runtime/api-contracts";
import { createBrowserMicCaptureDeps } from "../capture/karaoke-mic-capture-browser";
import { KaraokePlaybackGraph, type KaraokePlaybackInterruption } from "../capture/karaoke-playback-graph";
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
  notePause(songMs: number): void | Promise<void>;
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

/** Construction boundary for browser audio and microphone/transport fixtures. */
export interface KaraokeScoringConstruction {
  readonly createController: typeof createKaraokeScoringController;
  readonly createPlaybackGraph: (onInterrupted: KaraokePlaybackInterruption) => KaraokePlaybackGraph;
}

const browserScoringConstruction: KaraokeScoringConstruction = {
  createController: createKaraokeScoringController,
  createPlaybackGraph: onInterrupted => new KaraokePlaybackGraph(undefined, onInterrupted),
};

/** Solid lifecycle edge for the framework-neutral karaoke scoring controller. */
export function useKaraokeScoring(
  options: UseKaraokeScoringOptions,
  construction: KaraokeScoringConstruction = browserScoringConstruction,
): UseKaraokeScoringResult {
  const [state, setState] = createSignal<KaraokeScoringState | null>(null);
  const [playbackInterrupted, setPlaybackInterrupted] = createSignal(false);
  let recoveryGeneration = 0;
  const playbackGraph = construction.createPlaybackGraph((songMs, contextState, alreadyPaused) => {
    recoveryGeneration += 1;
    const status = currentController?.getState().status;
    // Renewal already suspended capture at its held song clock. Its media
    // element can temporarily read zero while the replacement URL loads.
    if (!alreadyPaused) currentController?.notePause(songMs);
    if (contextState === "closed") {
      setPlaybackInterrupted(false);
      if (["requesting-mic", "connecting", "active", "reconnecting"].includes(status ?? "")) currentController?.abort("karaoke_audio_closed");
    } else if (["active", "reconnecting"].includes(status ?? "")) {
      setPlaybackInterrupted(true);
    }
  });
  onCleanup(() => { recoveryGeneration += 1; playbackGraph.dispose(); });
  let playbackElement: HTMLAudioElement | null = null;
  let currentController: KaraokeScoringController | null = null;

  createEffect(
    () => options.enabled,
    (enabled) => {
      if (!enabled) {
        recoveryGeneration += 1;
        currentController = null;
        setState(null);
        return;
      }

      const controller = construction.createController({
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
      const unsubscribe = controller.subscribe(next => {
        if (next.status !== "active") recoveryGeneration += 1;
        setState(next);
      });

      return () => {
        recoveryGeneration += 1;
        unsubscribe();
        controller.dispose();
        if (currentController === controller) currentController = null;
      };
    },
  );

  const controls: KaraokeScoringControls = {
    attachPlaybackElement: (element) => {
      if (element !== playbackElement) recoveryGeneration += 1;
      playbackElement = element;
      playbackGraph.attach(element);
      if (!element) setPlaybackInterrupted(false);
    },
    resumePlayback: async () => {
      const controller = currentController;
      const element = playbackElement;
      const request = ++recoveryGeneration;
      if (!controller || !element || controller.getState().status !== "active") return false;
      // Start resume synchronously in the gesture. Only this unchanged take and
      // running context may clear the latch; capture still waits for notePlay.
      const running = await playbackGraph.resume();
      if (!running || request !== recoveryGeneration || currentController !== controller
        || playbackElement !== element || controller.getState().status !== "active" || !playbackGraph.isRunning()) return false;
      setPlaybackInterrupted(false);
      return true;
    },
    abort: (code) => { recoveryGeneration += 1; setPlaybackInterrupted(false); currentController?.abort(code); },
    noteFinish: (songMs) => { recoveryGeneration += 1; setPlaybackInterrupted(false); currentController?.noteFinish(songMs); },
    notePause: (songMs) => currentController?.notePause(songMs),
    notePlay: (songMs) => {
      if (playbackInterrupted() && !playbackGraph.isRunning()) return;
      setPlaybackInterrupted(false);
      currentController?.notePlay(songMs);
    },
    noteSeek: (songMs) => currentController?.noteSeek(songMs),
    noteTime: (songMs) => { playbackGraph.checkState(); currentController?.noteTime(songMs); },
    start: (songMs) => { recoveryGeneration += 1; setPlaybackInterrupted(false); void currentController?.start(songMs); },
    stop: () => { recoveryGeneration += 1; setPlaybackInterrupted(false); currentController?.stop(); },
  };

  return { controls, enabled: () => options.enabled, playbackInterrupted, state };
}
