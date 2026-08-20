import { describe, expect, test } from "bun:test";

import type { LiveComposerState } from "./types";
import {
  deriveLiveStateForRoomKindChange,
  isLiveVisibilityAllowedForAccess,
  shouldClearSelectedQualifiers,
  shouldForcePublicIdentityForAuthor,
  shouldForcePublicIdentityForTab,
} from "./invariants";

function liveState(overrides: Partial<LiveComposerState> = {}): LiveComposerState {
  return {
    roomKind: "solo",
    accessMode: "free",
    visibility: "public",
    setlistItems: [],
    setlistStatus: "draft",
    performerAllocations: [{ userId: "host-1", role: "host", sharePct: 100 }],
    ...overrides,
  };
}

describe("post composer invariants", () => {
  test("rejects paid live rooms that are still unlisted without mutating the choice", () => {
    const state = {
      ...liveState(),
      accessMode: "paid",
      visibility: "unlisted",
    } as const;

    expect(isLiveVisibilityAllowedForAccess(state)).toBe(false);
    expect(state.visibility).toBe("unlisted");
    expect(isLiveVisibilityAllowedForAccess({
      ...state,
      visibility: "public",
    })).toBe(true);
  });

  test("allows anonymous identity on asset and live tabs", () => {
    expect(shouldForcePublicIdentityForTab({
      activeTab: "song",
      identityMode: "anonymous",
      monetizationVisible: false,
    })).toBe(false);
    expect(shouldForcePublicIdentityForTab({
      activeTab: "video",
      identityMode: "anonymous",
      monetizationVisible: true,
    })).toBe(false);
    expect(shouldForcePublicIdentityForTab({
      activeTab: "live",
      identityMode: "anonymous",
      monetizationVisible: false,
    })).toBe(false);
    expect(shouldForcePublicIdentityForTab({
      activeTab: "image",
      identityMode: "anonymous",
      monetizationVisible: false,
    })).toBe(false);
    expect(shouldForcePublicIdentityForTab({
      activeTab: "song",
      identityMode: "public",
      monetizationVisible: false,
    })).toBe(false);
  });

  test("forces public identity for agent authors", () => {
    expect(shouldForcePublicIdentityForAuthor({
      authorMode: "agent",
      identityMode: "anonymous",
    })).toBe(true);
    expect(shouldForcePublicIdentityForAuthor({
      authorMode: "agent",
      identityMode: "public",
    })).toBe(false);
    expect(shouldForcePublicIdentityForAuthor({
      authorMode: "human",
      identityMode: "anonymous",
    })).toBe(false);
  });

  test("clears qualifiers when author or identity mode cannot carry them", () => {
    expect(shouldClearSelectedQualifiers({
      authorMode: "agent",
      identityMode: "anonymous",
      selectedQualifierCount: 1,
    })).toBe(true);
    expect(shouldClearSelectedQualifiers({
      authorMode: "human",
      identityMode: "public",
      selectedQualifierCount: 1,
    })).toBe(true);
    expect(shouldClearSelectedQualifiers({
      authorMode: "human",
      identity: { allowQualifiersOnAnonymousPosts: false },
      identityMode: "anonymous",
      selectedQualifierCount: 1,
    })).toBe(true);
    expect(shouldClearSelectedQualifiers({
      authorMode: "human",
      identity: { allowQualifiersOnAnonymousPosts: true },
      identityMode: "anonymous",
      selectedQualifierCount: 1,
    })).toBe(false);
    expect(shouldClearSelectedQualifiers({
      authorMode: "agent",
      identityMode: "anonymous",
      selectedQualifierCount: 0,
    })).toBe(false);
  });

  test("derives solo live allocation from a duet room transition", () => {
    expect(deriveLiveStateForRoomKindChange({
      current: liveState({
        guestUserId: "guest-1",
        roomKind: "solo",
        performerAllocations: [
          { userId: "host-1", role: "host", sharePct: 50 },
          { userId: "guest-1", role: "guest", sharePct: 50 },
        ],
      }),
      previousRoomKind: "duet",
    })).toEqual({
      roomKind: "solo",
      accessMode: "free",
      visibility: "public",
      setlistItems: [],
      setlistStatus: "draft",
      performerAllocations: [{ userId: "host-1", role: "host", sharePct: 100 }],
      guestUserId: undefined,
    });
  });

  test("derives duet live allocation from a solo room transition", () => {
    expect(deriveLiveStateForRoomKindChange({
      current: liveState({
        roomKind: "duet",
      }),
      previousRoomKind: "solo",
    })).toEqual({
      roomKind: "duet",
      accessMode: "free",
      visibility: "public",
      setlistItems: [],
      setlistStatus: "draft",
      performerAllocations: [
        { userId: "host-1", role: "host", sharePct: 50 },
        { userId: "", role: "guest", sharePct: 50 },
      ],
    });
  });

  test("does not derive live allocation when the room kind is unchanged", () => {
    expect(deriveLiveStateForRoomKindChange({
      current: liveState(),
      previousRoomKind: "solo",
    })).toBeNull();
  });
});
