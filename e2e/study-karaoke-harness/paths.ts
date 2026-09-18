import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deterministic paths for the local Study/Karaoke harness. The global setup
 * writes the generated audio here before any browser launches; the config and
 * specs import these constants so no environment is required.
 */
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const solidRepositoryRoot = path.resolve(moduleDirectory, "../..");

/** Fake microphone capture files (Chromium --use-file-for-fake-audio-capture). */
export const harnessAudioDirectory = path.join(
  solidRepositoryRoot,
  ".tmp",
  "study-karaoke-harness",
  "audio",
);
export const toneCaptureWav = path.join(harnessAudioDirectory, "tone-16k.wav");
export const silenceCaptureWav = path.join(harnessAudioDirectory, "silence-16k.wav");

/** A playable instrumental served from the Solid public directory at /harness/. */
export const instrumentalWav = path.join(
  solidRepositoryRoot,
  "public",
  "harness",
  "instrumental.wav",
);
export const instrumentalPublicPath = "/harness/instrumental.wav";

export const harnessManifestDefault = path.resolve(
  solidRepositoryRoot,
  "..",
  "..",
  "..",
  ".worktrees",
  "api-next",
  "api-study-karaoke-local-provider-seam",
  "tests",
  "study-karaoke-harness",
  ".local",
  "harness.json",
);
