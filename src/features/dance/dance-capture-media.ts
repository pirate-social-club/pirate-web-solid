import {
  ALL_FORMATS, BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink,
  EncodedVideoPacketSource, Input, Mp4OutputFormat, Output,
} from "mediabunny";

const refused = () => new Error("dance_capture_incomplete");

/** Keep the complete zero-based capture prefix, including its assigned cue.
 * Only the tail after the frozen endpoint is removed. Packets are copied,
 * never re-encoded, stretched or shifted to make an incomplete take fit. */
export async function boundDanceRecording(input: {
  readonly file: File;
  readonly bodyEndMs: number;
  readonly maximumBytes: number;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}): Promise<File> {
  const current = () => { input.signal.throwIfAborted(); input.assertCurrent(); };
  current();
  if (!Number.isSafeInteger(input.bodyEndMs) || input.bodyEndMs <= 0 || !Number.isSafeInteger(input.maximumBytes) || input.maximumBytes <= 0) throw refused();
  const end = input.bodyEndMs / 1000;
  const source = new Input({ source: new BlobSource(input.file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }) });
  const abort = () => { source.dispose(); void output.cancel().catch(() => {}); };
  input.signal.addEventListener("abort", abort, { once: true });
  try {
    const [video, audio] = await Promise.all([source.getPrimaryVideoTrack(), source.getPrimaryAudioTrack()]); current();
    if (!video || !audio || await video.getCodec() !== "avc" || await audio.getCodec() !== "aac") throw refused();
    const [videoConfig, audioConfig] = await Promise.all([video.getDecoderConfig(), audio.getDecoderConfig()]); current();
    if (!videoConfig || !audioConfig) throw refused();
    const videoOutput = new EncodedVideoPacketSource("avc"), audioOutput = new EncodedAudioPacketSource("aac");
    output.addVideoTrack(videoOutput); output.addAudioTrack(audioOutput);
    await output.start(); current();
    const copy = async (kind: "video" | "audio") => {
      const track = kind === "video" ? video : audio;
      const sink = new EncodedPacketSink(track);
      let first = true, previous = -Infinity, coveredUntil = 0;
      for await (const packet of sink.packets()) {
        current();
        // The app's realtime baseline capture has no reordered frames. Do not
        // cut a dependency out of another encoder's reordered stream.
        if (packet.timestamp < previous || packet.duration <= 0) throw refused();
        // Non-presented AAC pre-roll may seed decoder history. This path
        // cannot preserve negative timestamps, so refuse instead of silently
        // dropping a packet or shifting either track to make it fit.
        if (packet.timestamp < 0) throw refused();
        if (first && kind === "video" && (Math.round(packet.timestamp * 1e6) !== 0 || packet.type !== "key")) throw refused();
        if (packet.timestamp >= end) break;
        if (packet.timestamp - coveredUntil > 0.000001) throw refused();
        previous = packet.timestamp;
        coveredUntil = Math.max(coveredUntil, packet.timestamp + packet.duration);
        const duration = Math.min(packet.duration, end - packet.timestamp);
        const bounded = duration === packet.duration ? packet : packet.clone({ duration });
        if (kind === "video") await videoOutput.add(bounded, first ? { decoderConfig: videoConfig } : undefined);
        else await audioOutput.add(bounded, first ? { decoderConfig: audioConfig } : undefined);
        first = false;
      }
      current();
      if (first || coveredUntil + 0.000001 < end) throw refused();
      if (kind === "video") videoOutput.close(); else audioOutput.close();
    };
    await Promise.all([copy("video"), copy("audio")]); current();
    await output.finalize(); current();
    if (!target.buffer || target.buffer.byteLength > input.maximumBytes) throw new Error("dance_capture_size_exceeded");
    const file = new File([target.buffer], "dance-recording.mp4", { type: "video/mp4" });
    const verified = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const [v, a] = await Promise.all([verified.getPrimaryVideoTrack(), verified.getPrimaryAudioTrack()]); current();
      if (!v || !a) throw refused();
      const [videoEnd, audioEnd, containerEnd, start] = await Promise.all([v.computeDuration(), a.computeDuration(), verified.computeDuration(), v.getFirstTimestamp()]); current();
      if (Math.round(start * 1e6) !== 0 || [videoEnd, audioEnd, containerEnd].some(value => Math.round(value * 1000) !== input.bodyEndMs)) throw refused();
    } finally { verified.dispose(); }
    return file;
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    input.signal.removeEventListener("abort", abort);
    source.dispose();
  }
}
