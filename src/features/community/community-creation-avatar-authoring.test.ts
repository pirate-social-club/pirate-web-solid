import { describe, expect, test } from "vitest";
import {
  COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN,
  communityCreationAvatarAuthoringEnabled,
} from "./community-creation-avatar-authoring.ts";

describe("community creation avatar authoring route switch", () => {
  test("enables only when the request and configured application origins are the exact staging origin", () => {
    expect(communityCreationAvatarAuthoringEnabled(
      true,
      COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN,
      COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN,
    )).toBe(true);

    for (const [configured, requestOrigin, canonicalOrigin] of [
      [false, COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN, COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, "https://pirate.sc", COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN, "https://pirate.sc"],
      [true, "http://web-next-staging.pirate.sc", COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, "https://web-next-staging.pirate.sc:444", COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, "https://web-next-staging.pirate.sc.evil.invalid", COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, undefined, COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN],
      [true, COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN, undefined],
    ] as const) {
      expect(communityCreationAvatarAuthoringEnabled(configured, requestOrigin, canonicalOrigin)).toBe(false);
    }
  });
});
