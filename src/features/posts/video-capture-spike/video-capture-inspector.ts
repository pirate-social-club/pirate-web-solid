import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
} from "mediabunny";

import type { VideoPacketFact } from "./video-capture-model";
import { normalizeVideoMimeType } from "./video-capture-model";

export type VideoCaptureInspection = {
  byteLength: number;
  observedBlobType: string;
  detectedMimeType: string;
  durationUs: number;
  video: {
    codec: string | null;
    codecParameter: string | null;
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    rotation: number;
  };
  audio: null | {
    codec: string | null;
    codecParameter: string | null;
    channels: number;
    sampleRate: number;
  };
  packets: readonly VideoPacketFact[];
};

/** Locally re-opens finalized bytes and records probed facts; it is not server authority. */
export async function inspectFinalizedVideo(blob: Blob): Promise<VideoCaptureInspection> {
  if (blob.size === 0) throw new Error("A finalized capture cannot be empty.");
  normalizeVideoMimeType(blob.type);

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("The finalized capture has no video track.");
    const audioTrack = await input.getPrimaryAudioTrack();
    const packets: VideoPacketFact[] = [];
    const sink = new EncodedPacketSink(videoTrack);
    for await (const packet of sink.packets(undefined, undefined, { verifyKeyPackets: true })) {
      packets.push({
        sequenceNumber: packet.sequenceNumber,
        timestampUs: packet.microsecondTimestamp,
        durationUs: packet.microsecondDuration,
        type: packet.type,
        byteLength: packet.byteLength,
      });
    }

    return {
      byteLength: blob.size,
      observedBlobType: blob.type,
      detectedMimeType: await input.getMimeType(),
      durationUs: Math.round((await input.computeDuration()) * 1_000_000),
      video: {
        codec: await videoTrack.getCodec(),
        codecParameter: await videoTrack.getCodecParameterString(),
        codedWidth: await videoTrack.getCodedWidth(),
        codedHeight: await videoTrack.getCodedHeight(),
        displayWidth: await videoTrack.getDisplayWidth(),
        displayHeight: await videoTrack.getDisplayHeight(),
        rotation: await videoTrack.getRotation(),
      },
      audio: audioTrack
        ? {
            codec: await audioTrack.getCodec(),
            codecParameter: await audioTrack.getCodecParameterString(),
            channels: await audioTrack.getNumberOfChannels(),
            sampleRate: await audioTrack.getSampleRate(),
          }
        : null,
      packets,
    };
  } finally {
    input.dispose();
  }
}
