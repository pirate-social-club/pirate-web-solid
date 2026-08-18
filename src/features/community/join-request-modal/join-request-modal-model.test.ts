import { describe, expect, test } from "bun:test";

import {
  joinRequestNoteCount,
  limitJoinRequestNote,
  MAX_NOTE_LENGTH,
  submitJoinRequestNote,
} from "./join-request-modal-model";

describe("join request modal model", () => {
  test("clamps initial and input notes to the exact 500-character contract", () => {
    const longNote = "x".repeat(MAX_NOTE_LENGTH + 3);

    expect(limitJoinRequestNote(undefined)).toBe("");
    expect(limitJoinRequestNote("  ready  ")).toBe("  ready  ");
    expect(limitJoinRequestNote(longNote)).toHaveLength(MAX_NOTE_LENGTH);
    expect(joinRequestNoteCount("  ready  ")).toBe(9);
  });

  test("trims only the submitted payload", () => {
    expect(submitJoinRequestNote("  Let me join.  ")).toBe("Let me join.");
    expect(submitJoinRequestNote("   ")).toBe("");
  });
});
