import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  harnessAudioDirectory,
  instrumentalWav,
  silenceCaptureWav,
  toneCaptureWav,
} from "./paths.ts";

/**
 * Generates the deterministic audio used by the local harness:
 *
 * - a tone capture file for the fake microphone (all scored/Study takes),
 * - a silent capture file for the no-vocal cases,
 * - a playable instrumental the karaoke <audio> element can load from the
 *   Solid dev server's /harness/ path.
 *
 * The provider doubles never read the audio bytes, so the tone only needs to be
 * a valid, continuous input; the silent file is real silence.
 */
const SAMPLE_RATE = 16_000;

function wavBytes(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index] ?? 0, 44 + index * 2);
  }
  return buffer;
}

function tone(seconds: number, frequency: number, amplitude: number): Int16Array {
  const samples = new Int16Array(SAMPLE_RATE * seconds);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.round(
      amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE),
    );
  }
  return samples;
}

export default function globalSetup(): void {
  mkdirSync(harnessAudioDirectory, { recursive: true });
  writeFileSync(toneCaptureWav, wavBytes(tone(40, 196, 8_000)));
  writeFileSync(silenceCaptureWav, wavBytes(new Int16Array(SAMPLE_RATE * 40)));
  mkdirSync(path.dirname(instrumentalWav), { recursive: true });
  // 10 seconds covers the seeded lyric timeline, which ends near 7.4 s, with a
  // tail for the finish event.
  writeFileSync(instrumentalWav, wavBytes(tone(10, 220, 4_000)));
}
