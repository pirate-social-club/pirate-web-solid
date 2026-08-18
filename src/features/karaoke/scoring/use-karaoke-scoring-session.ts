import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import type { ScorableKaraokeLine } from "../runtime";
import type { ApiKaraokeSession } from "../runtime/api-contracts";
import { createBrowserMicCaptureDeps } from "../capture/karaoke-mic-capture-browser";
import { KaraokeMicCapture } from "../capture/karaoke-mic-capture";
import {
  createKaraokeScoringController,
  type KaraokeScoringController,
  type KaraokeScoringState,
} from "./karaoke-scoring-controller";

function resolveWorkletModuleUrl(): URL {
  // Vite emits the processor as an independent module asset; keeping the URL
  // relative to this edge wrapper avoids a hard-coded deployment path.
  return new URL("../capture/karaoke-capture-processor.ts", import.meta.url);
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
  state: Accessor<KaraokeScoringState | null>;
  controls: KaraokeScoringControls;
}

/** Solid lifecycle edge for the framework-neutral karaoke scoring controller. */
export function useKaraokeScoring(
  options: UseKaraokeScoringOptions,
): UseKaraokeScoringResult {
  const [state, setState] = createSignal<KaraokeScoringState | null>(null);
  let currentController: KaraokeScoringController | null = null;

  createEffect(() => {
    if (!options.enabled) {
      currentController = null;
      setState(null);
      return;
    }

    const controller = createKaraokeScoringController({
      communityId: options.communityId,
      createCaptureEngine: ({ onChunk, onError }) =>
        new KaraokeMicCapture({
          deps: createBrowserMicCaptureDeps(options.workletModuleUrl ?? resolveWorkletModuleUrl()),
          onChunk,
          onError,
        }),
      createKaraokeSession: ({ idempotencyKey, signal }) =>
        options.createKaraokeSession(options.communityId, options.postId, idempotencyKey, signal),
      postId: options.postId,
      scorableLines: options.scorableLines,
    });
    currentController = controller;
    setState(controller.getState());
    const unsubscribe = controller.subscribe(setState);

    onCleanup(() => {
      unsubscribe();
      controller.dispose();
      if (currentController === controller) currentController = null;
    });
  });

  const controls: KaraokeScoringControls = {
    abort: (code) => currentController?.abort(code),
    noteFinish: (songMs) => currentController?.noteFinish(songMs),
    notePause: (songMs) => currentController?.notePause(songMs),
    notePlay: (songMs) => currentController?.notePlay(songMs),
    noteSeek: (songMs) => currentController?.noteSeek(songMs),
    noteTime: (songMs) => currentController?.noteTime(songMs),
    start: (songMs) => { void currentController?.start(songMs); },
    stop: () => currentController?.stop(),
  };

  return { controls, enabled: () => options.enabled, state };
}
