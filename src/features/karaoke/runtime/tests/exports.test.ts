import { describe, expect, test } from "bun:test";
import * as runtime from "../index";
import * as testEntry from "../test";

describe("karaoke-runtime exports", () => {
  test("production entry exports the public contract surface", () => {
    expect(typeof runtime.aggregateKaraokeSession).toBe("function");
    expect(typeof runtime.bucketRecognizedWordsIntoLines).toBe("function");
    expect(typeof runtime.scoreKaraokeLine).toBe("function");
    expect(typeof runtime.createKaraokeSessionState).toBe("function");
    expect(typeof runtime.reduceKaraokeSession).toBe("function");
    expect(typeof runtime.validateKaraokeTransportEnvelope).toBe("function");
    expect(typeof runtime.validateKaraokeClientEventPayload).toBe("function");
    expect(typeof runtime.validateKaraokeStreamingSttEventPayload).toBe("function");
    expect(typeof runtime.encodeKaraokeBinaryFrame).toBe("function");
    expect(typeof runtime.decodeKaraokeBinaryFrame).toBe("function");
    expect(typeof runtime.KaraokeSessionHost).toBe("function");
    expect(typeof runtime.serializeKaraokeScoringPolicy).toBe("function");
    expect(typeof runtime.deserializeKaraokeScoringPolicy).toBe("function");
    expect(typeof runtime.serializeKaraokeSessionSnapshot).toBe("function");
    expect(typeof runtime.deserializeKaraokeSessionSnapshot).toBe("function");
    expect(runtime.KARAOKE_TRANSPORT_PROTOCOL_VERSION).toBe(1);
    expect(runtime.KARAOKE_BINARY_PROTOCOL_VERSION).toBe(1);
    expect(runtime.KARAOKE_BINARY_HEADER_BYTES).toBe(28);
    expect(runtime.KARAOKE_MAX_BINARY_FRAME_BYTES).toBe(200_000);
    expect(typeof runtime.KARAOKE_LINE_WINDOW_LEAD_MS).toBe("number");
    expect(typeof runtime.KARAOKE_LINE_WINDOW_TRAIL_MS).toBe("number");
    // Explicitly-versioned scoring contract (see karaoke-rankings spec).
    expect(runtime.KARAOKE_SCORING_VERSION).toBe(5);
    expect(Number.isInteger(runtime.KARAOKE_SCORING_VERSION)).toBe(true);
    expect(runtime.KARAOKE_TIMING_SCORING_ENABLED).toBe(true);
  });

  test("production entry does not export fakes or test utilities", () => {
    const exportedKeys = Object.keys(runtime);
    expect(exportedKeys).not.toContain("FakeKaraokeEffectRunner");
    expect(exportedKeys).not.toContain("FakeKaraokeStreamingSttAdapter");
    expect((runtime as Record<string, unknown>).FakeKaraokeEffectRunner).toBeUndefined();
    expect((runtime as Record<string, unknown>).FakeKaraokeStreamingSttAdapter).toBeUndefined();
  });

  test("test subpath exports the fakes", () => {
    expect(typeof testEntry.FakeKaraokeEffectRunner).toBe("function");
    expect(typeof testEntry.FakeKaraokeStreamingSttAdapter).toBe("function");
  });
});
