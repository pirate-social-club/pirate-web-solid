/**
 * Phase 5.2 — production browser dependency factory for {@link KaraokeMicCapture}.
 *
 * Browser-only: references `navigator`, `AudioContext`, and `AudioWorkletNode`,
 * which do not exist under bun, so this file is NOT unit-tested. It is the real
 * implementation of the injected `deps` the engine consumes. The context uses the
 * hardware-native sample rate (forcing 16 kHz makes the mic source emit silence);
 * the engine reads the ACTUAL `context.sampleRate` and the DSP resamples to 16 kHz.
 *
 * NOTE (audit F6): this still needs a real-browser smoke test + the Vite worklet
 * build wiring verified — neither can run in this (headless/bun) environment.
 */

import type { KaraokeMicCaptureDeps, MicAudioContext } from "./karaoke-mic-capture";

const WORKLET_PROCESSOR_NAME = "karaoke-capture-processor";

/**
 * @param workletModuleUrl built URL of `karaoke-capture-processor.ts`, e.g.
 *   `new URL("./karaoke-capture-processor.ts", import.meta.url)` (Vite bundles it).
 */
export function createBrowserMicCaptureDeps(workletModuleUrl: URL | string): KaraokeMicCaptureDeps {
  return {
    addWorkletModule: (context) =>
      (context as unknown as AudioContext).audioWorklet.addModule(
        typeof workletModuleUrl === "string" ? workletModuleUrl : workletModuleUrl.href,
      ),
    createContext: () =>
      // Use the hardware-native rate. Forcing { sampleRate: 16000 } makes the mic
      // MediaStreamSource emit SILENCE in Chrome/Firefox (sample-rate mismatch with
      // the capture device) — observed as a steady ~0 peak/RMS on staging. The
      // worklet's StreamingResampler downsamples the native rate to 16 kHz output.
      new AudioContext() as unknown as MicAudioContext,
    createWorkletNode: (context) =>
      new AudioWorkletNode(context as unknown as BaseAudioContext, WORKLET_PROCESSOR_NAME) as unknown as ReturnType<
        KaraokeMicCaptureDeps["createWorkletNode"]
      >,
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints) as unknown as ReturnType<
        KaraokeMicCaptureDeps["getUserMedia"]
      >,
  };
}
