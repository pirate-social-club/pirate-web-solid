import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { createVideoComposerMachine, type ComposerOperations } from "./video-composer-machine";

const sourcePath = (file: string) => resolve(process.cwd(), "src/features/posts/video-submission", file);
const storySource = readFileSync(sourcePath("video-authoring.stories.tsx"), "utf8");
const runtimeTests = readFileSync(sourcePath("video-composer-runtime.test.tsx"), "utf8");
const machineTests = readFileSync(sourcePath("video-composer-machine.test.ts"), "utf8");
const mediaTests = readFileSync(sourcePath("video-composer-media.test.ts"), "utf8");

// Every state has a visible story or an explicit internal-only reason, and a
// transition test. The state key check forces this inventory to change when
// the chart changes. Story/test references are checked against their sources.
const coverage = {
  restoring: { story: "SubmittedUploadResumes", test: "resumes on its own" },
  choosingSong: { story: "ExcerptSelection", test: "the excerpt is chosen before any clip" },
  checkingPlayback: { internal: "Transient playback check shown by Continue", test: "changing the song while playback is checked" },
  capture: { story: "RecordingReady", test: "the camera shows on the capture screen" },
  "capture.idle": { story: "RecordingReady", test: "the camera shows on the capture screen" },
  "capture.inspecting": { internal: "File inspection has no stable screen", test: "an uploaded 16 second video is refused" },
  "capture.preparingGuide": { internal: "Guide buffer wait has a loading notice", test: "the complete local guide precedes capture" },
  "capture.startingCapture": { internal: "Camera permission is pending", test: "hiding the page while capture opens" },
  "capture.startingGuide": { internal: "Guide startup is pending", test: "a stop during guide startup is honored" },
  "capture.recording": { story: "GuidedRecording", test: "recording plays the guide" },
  "capture.interrupting": { story: "GuideInterrupted", test: "a real guide gap discards the take" },
  "capture.finalizing": { story: "RecordingStopped", test: "after Stop the capture screen says the take is being finished" },
  review: { story: "ReviewPlayback", test: "review plays the intended soundtrack locally" },
  submitting: { story: "UploadProgress", test: "reserves, uploads and finalizes" },
  retained: { story: "SubmittedUploadNeedsAnotherTry", test: "a failed upload offers one retry action" },
  refreshing: { story: "SubmittedUploadResumes", test: "an unconfirmed finalize goes Home" },
  startingOver: { story: "SubmittedUploadExpired", test: "Start over cancels an expired upload" },
} as const;

const scenarios = [
  "a late prepared guide cannot enter capture after selection changes",
  "a take abandoned because the excerpt moved during camera permission releases the granted camera",
  "changing the song while playback is checked cannot advance the old selection",
  "hiding the page while capture opens cancels the returned session",
  "hiding the page ends a guided take rather than letting the sound drift",
  "a real guide gap discards the take and offers a retake in the camera",
  "going back from review reopens the camera",
  "leaving the composer releases the camera",
  "an effect can send without a synchronous subscription write",
  "disposal drops queued sends and stops the owned actor",
  "song approval, capture, finalization and Publish have one path",
  "two Publish events queued by the Solid bridge start only one operation",
  "a late camera session is cancelled without being attached or keeping its guide",
  "a late guide source is released without creating playable audio",
  "camera permission granted after disposal stops the preview tracks",
  "an unconfirmed finalize goes Home and preserves its receipt without sending twice",
];

test("visible stories and transition tests cover every composer state", () => {
  const operations = {
    restore: async () => ({ record: null, released: false, resume: false }),
    checkPlayback: async () => {}, inspectFile: async (file: File) => ({ file, durationMs: null, alignment: "none" as const }),
    prepareGuide: async () => { throw new Error("not invoked"); },
    startCapture: async () => { throw new Error("not invoked"); },
    startGuide: async () => { throw new Error("not invoked"); },
    finishCapture: async () => { throw new Error("not invoked"); },
    cancelCapture: async () => {}, publish: async () => ({ posted: false }),
    startOver: async () => {}, refresh: async () => false,
    canCapture: () => false, canPublish: () => false, shouldRefresh: () => false,
    onPosted() {}, onExit() {}, onReset() {}, syncPreview() {}, closePreview() {}, discardPrepared() {},
  } satisfies ComposerOperations;
  const machine = createVideoComposerMachine(operations, true);
  const paths = Object.entries(machine.states).flatMap(([name, node]) => [name, ...Object.keys(node.states).map(child => `${name}.${child}`)]);
  expect(Object.keys(coverage).sort()).toEqual(paths.sort());
  for (const entry of Object.values(coverage)) {
    if ("story" in entry) expect(storySource).toContain(`export const ${entry.story}: Story`);
    else expect(entry.internal.length).toBeGreaterThan(12);
    expect(runtimeTests + machineTests).toContain(entry.test);
  }
});

test("cancellation, disposal, retake, repeat Publish and ambiguous finalize have named scenarios", () => {
  const evidence = runtimeTests + machineTests + mediaTests
    + readFileSync(sourcePath("solid-actor.test.ts"), "utf8");
  for (const scenario of scenarios) expect(evidence).toContain(scenario);
});
