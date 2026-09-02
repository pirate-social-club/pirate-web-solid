export type VideoSourceCodec = "h264" | "hevc" | "vp8" | "vp9" | "aac" | "opus";

export type VideoSourceDeclaration = {
  mediaType: "video/mp4" | "video/quicktime" | "video/webm";
  codecs: readonly VideoSourceCodec[];
  observedMimeType: string;
};

export type VideoPacketFact = {
  sequenceNumber: number;
  timestampUs: number;
  durationUs: number;
  type: "key" | "delta";
  byteLength: number;
};

export type CopyPreview = {
  sourceStartUs: number;
  requestedEndUs: number;
  effectiveEndUs: number;
  effectiveDurationUs: number;
  tailShortfallUs: number;
  packetSequenceNumbers: readonly number[];
};

export type ConstrainedBaselineCaptureProfile = {
  width: number;
  height: number;
  frameRate: number;
  fullCodecString: "avc1.42e01e" | "avc1.42e01f" | "avc1.42e028";
  level: "3.0" | "3.1" | "4.0";
  macroblocksPerFrame: number;
  macroblocksPerSecond: number;
};

export type PacketReorderingEvidence = {
  verdict: "no_reordering" | "reordering_present" | "indeterminate";
  hasFrameReordering: boolean | null;
  sequenceNumbersDefined: boolean;
  sequenceNumbersUnique: boolean;
  presentationTimestampRegressionsInDecodeOrder: number;
  duplicatePresentationTimestamps: number;
  decodeOrderSequenceNumbers: readonly number[];
  presentationOrderSequenceNumbers: readonly number[];
  note: string;
};

const AVC_LEVEL_LIMITS = [
  { level: "3.0", levelHex: "1e", maxMacroblocksPerFrame: 1_620, maxMacroblocksPerSecond: 40_500 },
  { level: "3.1", levelHex: "1f", maxMacroblocksPerFrame: 3_600, maxMacroblocksPerSecond: 108_000 },
  { level: "4.0", levelHex: "28", maxMacroblocksPerFrame: 8_192, maxMacroblocksPerSecond: 245_760 },
] as const;

/** Chooses the lowest bounded AVC level for the actual camera dimensions and frame rate. */
export function selectConstrainedBaselineProfile(
  width: number,
  height: number,
  frameRate: number,
): ConstrainedBaselineCaptureProfile {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error("Capture dimensions must be positive integers.");
  }
  if (!Number.isFinite(frameRate) || frameRate <= 0) throw new Error("Capture frame rate must be positive.");
  const macroblocksPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const macroblocksPerSecond = Math.ceil(macroblocksPerFrame * frameRate);
  const selected = AVC_LEVEL_LIMITS.find((candidate) => (
    macroblocksPerFrame <= candidate.maxMacroblocksPerFrame
    && macroblocksPerSecond <= candidate.maxMacroblocksPerSecond
  ));
  if (!selected) throw new Error("The camera track exceeds the bounded Constrained Baseline capture matrix.");

  return {
    width,
    height,
    frameRate,
    fullCodecString: `avc1.42e0${selected.levelHex}`,
    level: selected.level,
    macroblocksPerFrame,
    macroblocksPerSecond,
  };
}

/** Derives B-frame/reordering evidence from Mediabunny decode sequence numbers and packet PTS. */
export function analyzePacketReordering(packets: readonly VideoPacketFact[]): PacketReorderingEvidence {
  const sequenceNumbersDefined = packets.length > 0 && packets.every((packet) => packet.sequenceNumber >= 0);
  const sequenceNumbersUnique = new Set(packets.map((packet) => packet.sequenceNumber)).size === packets.length;
  if (!sequenceNumbersDefined || !sequenceNumbersUnique) {
    return {
      verdict: "indeterminate",
      hasFrameReordering: null,
      sequenceNumbersDefined,
      sequenceNumbersUnique,
      presentationTimestampRegressionsInDecodeOrder: 0,
      duplicatePresentationTimestamps: 0,
      decodeOrderSequenceNumbers: [],
      presentationOrderSequenceNumbers: [],
      note: "No-frame-reordering cannot be proved without decode-order sequence numbers.",
    };
  }

  const decodeOrder = packets.slice().sort((left, right) => left.sequenceNumber - right.sequenceNumber);
  const presentationOrder = packets.slice().sort((left, right) => (
    left.timestampUs - right.timestampUs || left.sequenceNumber - right.sequenceNumber
  ));
  let regressions = 0;
  const duplicatePresentationTimestamps = packets.length
    - new Set(packets.map((packet) => packet.timestampUs)).size;
  for (let index = 1; index < decodeOrder.length; index += 1) {
    if (decodeOrder[index]!.timestampUs < decodeOrder[index - 1]!.timestampUs) regressions += 1;
  }
  const hasFrameReordering = regressions > 0;
  const verdict = duplicatePresentationTimestamps > 0
    ? "indeterminate"
    : hasFrameReordering ? "reordering_present" : "no_reordering";
  return {
    verdict,
    hasFrameReordering: verdict === "indeterminate" ? null : hasFrameReordering,
    sequenceNumbersDefined,
    sequenceNumbersUnique,
    presentationTimestampRegressionsInDecodeOrder: regressions,
    duplicatePresentationTimestamps,
    decodeOrderSequenceNumbers: decodeOrder.map((packet) => packet.sequenceNumber),
    presentationOrderSequenceNumbers: presentationOrder.map((packet) => packet.sequenceNumber),
    note: "Mediabunny exposes decode order as sequenceNumber and PTS as timestamp; it does not expose source DTS.",
  };
}

export function maximumKeyframeGapUs(packets: readonly VideoPacketFact[]): number | null {
  const timestamps = keyframeTimestampsUs(packets);
  if (timestamps.length < 2) return null;
  return Math.max(...timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!));
}

function codecFamily(token: string): VideoSourceCodec | undefined {
  const normalized = token.trim().toLowerCase();
  const prefix = normalized.split(".", 1)[0] ?? normalized;
  if (normalized === "vp8.0") return "vp8";
  if (prefix === "avc1" || prefix === "avc3" || prefix === "h264") return "h264";
  if (prefix === "hev1" || prefix === "hvc1" || prefix === "hevc") return "hevc";
  if (prefix === "vp8") return "vp8";
  if (prefix === "vp9" || prefix === "vp09") return "vp9";
  if (prefix === "aac" || prefix === "mp4a") return "aac";
  if (prefix === "opus") return "opus";
  return undefined;
}

function containerAllowsCodec(
  mediaType: VideoSourceDeclaration["mediaType"],
  codec: VideoSourceCodec,
): boolean {
  if (mediaType === "video/webm") return codec === "vp8" || codec === "vp9" || codec === "opus";
  return codec === "h264" || codec === "hevc" || codec === "aac";
}

/** Strict spike parser for exact MediaRecorder, Blob, and Mediabunny MIME observations. */
export function normalizeVideoMimeType(observedMimeType: string): VideoSourceDeclaration {
  if (observedMimeType.length === 0 || observedMimeType.length > 256) {
    throw new Error("The observed video MIME type must contain between 1 and 256 characters.");
  }

  const [rawMediaType, ...rawParameters] = observedMimeType.split(";");
  const normalizedMediaType = rawMediaType?.trim().toLowerCase();
  if (
    normalizedMediaType !== "video/mp4"
    && normalizedMediaType !== "video/quicktime"
    && normalizedMediaType !== "video/webm"
  ) {
    throw new Error("The video container MIME type is not approved.");
  }
  const mediaType = normalizedMediaType;

  let rawCodecs: string | undefined;
  for (const rawParameter of rawParameters) {
    const separator = rawParameter.indexOf("=");
    if (separator < 1) throw new Error("The video MIME type contains a malformed parameter.");
    const key = rawParameter.slice(0, separator).trim().toLowerCase();
    let value = rawParameter.slice(separator + 1).trim();
    if (key !== "codecs") throw new Error(`The video MIME parameter '${key}' is not approved.`);
    if (rawCodecs !== undefined) throw new Error("The video MIME type repeats its codecs parameter.");
    if (value.startsWith('"') || value.endsWith('"')) {
      if (!(value.startsWith('"') && value.endsWith('"') && value.length >= 2)) {
        throw new Error("The video codecs parameter has mismatched quotes.");
      }
      value = value.slice(1, -1);
    }
    rawCodecs = value;
  }

  if (!rawCodecs) throw new Error("The video MIME type does not identify its codecs.");
  const codecTokens = rawCodecs.split(",").map((token) => token.trim());
  if (codecTokens.some((token) => token.length === 0)) {
    throw new Error("The video MIME type contains an empty codec token.");
  }

  const codecs = codecTokens.map((token) => {
    const codec = codecFamily(token);
    if (!codec) throw new Error(`The video codec '${token}' is not approved.`);
    return codec;
  });
  if (new Set(codecs).size !== codecs.length) throw new Error("The video MIME type repeats a codec family.");
  if (codecs.filter((codec) => ["h264", "hevc", "vp8", "vp9"].includes(codec)).length !== 1) {
    throw new Error("The video MIME type must identify exactly one video codec.");
  }
  if (codecs.filter((codec) => codec === "aac" || codec === "opus").length > 1) {
    throw new Error("The video MIME type identifies more than one audio codec.");
  }
  if (codecs.some((codec) => !containerAllowsCodec(mediaType, codec))) {
    throw new Error("The declared codecs contradict the video container.");
  }

  return { mediaType, codecs, observedMimeType };
}

export function keyframeTimestampsUs(packets: readonly VideoPacketFact[]): readonly number[] {
  return packets
    .filter((packet) => packet.type === "key")
    .map((packet) => packet.timestampUs)
    .sort((left, right) => left - right);
}

export function snapStartToKeyframeUs(packets: readonly VideoPacketFact[], requestedStartUs: number): number {
  const candidates = keyframeTimestampsUs(packets).filter((timestamp) => timestamp <= requestedStartUs);
  const snapped = candidates.at(-1);
  if (snapped === undefined) throw new Error("No emitted keyframe exists at or before the requested start.");
  return snapped;
}

/** Mirrors the proposed keyframe-start and last-complete-packet-end copy preview. */
export function deriveCopyPreview(
  packets: readonly VideoPacketFact[],
  sourceStartUs: number,
  requestedDurationUs: number,
): CopyPreview {
  if (!Number.isInteger(sourceStartUs) || sourceStartUs < 0) throw new Error("Invalid source start.");
  if (!Number.isInteger(requestedDurationUs) || requestedDurationUs <= 0) {
    throw new Error("Invalid requested duration.");
  }
  if (!packets.some((packet) => packet.type === "key" && packet.timestampUs === sourceStartUs)) {
    throw new Error("Copy-target source start must equal an emitted keyframe timestamp.");
  }

  const requestedEndUs = sourceStartUs + requestedDurationUs;
  const accepted = packets.filter((packet) => {
    const packetEndUs = packet.timestampUs + packet.durationUs;
    return packet.timestampUs >= sourceStartUs && packetEndUs <= requestedEndUs;
  });
  if (accepted.length === 0) throw new Error("The requested window contains no complete video packet.");

  const effectiveEndUs = Math.max(...accepted.map((packet) => packet.timestampUs + packet.durationUs));
  return {
    sourceStartUs,
    requestedEndUs,
    effectiveEndUs,
    effectiveDurationUs: effectiveEndUs - sourceStartUs,
    tailShortfallUs: requestedEndUs - effectiveEndUs,
    packetSequenceNumbers: accepted
      .slice()
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((packet) => packet.sequenceNumber),
  };
}
