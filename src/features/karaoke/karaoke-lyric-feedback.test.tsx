import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createSignal } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { KaraokeLyricStage } from "./karaoke-lyric-stage";
import { deriveKaraokeFeedback } from "./karaoke-scoring-feedback";
import { createKaraokeScoringController } from "./scoring/karaoke-scoring-controller";
import type { KaraokeLineScore } from "./runtime";
import type { CreateKaraokeSessionClientOptions, KaraokeSessionBridgeHandle } from "./karaoke-session-bridge";

const mountUi = (ui: () => JSX.Element, host: HTMLElement) => solidRender(ui, host);
let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); document.body.replaceChildren(); });

test("partials never show a grade or replay the finalized line badge; a new scored line does", async () => {
  let events!: CreateKaraokeSessionClientOptions;
  const controller = createKaraokeScoringController({
    communityId: "community", postId: "song", scorableLines: [],
    createKaraokeSession: async () => { throw new Error("unused"); },
    createCaptureEngine: () => ({ start: async () => {}, stop: async () => {}, activate: async () => {}, deactivateAndFlush: async () => {}, captureClockMs: () => 0 }),
    createSessionClient: options => {
      events = options;
      const handle: KaraokeSessionBridgeHandle = {
        start: async () => {}, close: () => {}, getPhase: () => "live",
        abort: () => {}, finish: () => {}, pause: () => {}, resume: () => {}, seek: () => {},
        pushAudio: () => {}, playbackSync: () => {}, lineBoundary: () => {},
        setCaptureAnchor: () => {}, clearCaptureAnchor: () => {},
      };
      return handle;
    },
  });
  const [state, setState] = createSignal(controller.getState());
  const unsubscribe = controller.subscribe(setState);
  const host = document.createElement("div"); document.body.appendChild(host);
  const unmount = mountUi(() => <KaraokeLyricStage lines={[]} currentTimeMs={0} rating={deriveKaraokeFeedback(state()).rating} />, host);
  dispose = () => { unmount(); unsubscribe(); controller.dispose(); };
  await controller.start(0);
  let sequence = 0;
  const envelope = () => ({ protocolVersion: 1 as const, sessionId: "session", attemptId: "attempt", sequence: ++sequence, eventId: `event-${sequence}` });
  const partial = (text: string) => events.onServerEvent?.({ ...envelope(), type: "stt_partial", text, words: [] });
  const score = (lineId: string, scoredLineIndex: number) => {
    const result: KaraokeLineScore = {
      lineId, scoredLineIndex, lineIndex: scoredLineIndex, score: 0.92, uncertain: false,
      confidenceScore: null, finalizedReason: "line_end", recognizedWords: [], transcript: lineId,
      timingScore: null, textScore: { confidenceMean: null, keywordCoverage: 1, missedWords: [], phoneticAvailable: false, phoneticCoverage: 0, phoneticQuality: 0, score: 0.92, wer: 0 },
    };
    events.onServerEvent?.({ ...envelope(), type: "line_score", result });
  };
  const badge = () => host.querySelector(".karaoke-stage-rating");
  partial("first");
  await expect.poll(badge).toBeNull();
  score("first", 0);
  await expect.poll(() => badge()?.textContent).toBe("Perfect+92");
  const first = badge();
  for (const text of ["s", "se", "second"]) {
    partial(text);
    await expect.poll(() => state().partialTranscript).toBe(text);
    expect(badge()).toBe(first);
  }
  score("second", 1);
  await expect.poll(badge).not.toBe(first);
  expect(badge()?.textContent).toBe("Perfect+92");
});

// The design system's global reduced-motion rule shortens every animation to
// 0.01ms, so one that ends hidden leaves its element hidden. The rating's pop
// ends at opacity 0; reduced motion must swap it for a still, visible hold.
test("reduced motion holds the rating badge visible instead of fading it out", () => {
  const css = readFileSync(path.resolve(__dirname, "karaoke.css"), "utf8");
  const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name} \\{(.*)\\}`))?.[1] ?? "";
  expect(keyframes("karaoke-rating-pop")).toMatch(/100% \{ opacity: 0;/);
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.karaoke-stage-rating \{ animation-name: ([\w-]+); \}/);
  expect(reduced?.[1]).toBe("karaoke-rating-hold");
  const hold = keyframes("karaoke-rating-hold");
  expect(hold).toContain("opacity: 1;");
  expect(hold).not.toContain("opacity: 0");
  expect(hold).not.toContain("scale");
});
