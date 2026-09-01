import { describe, expect, it } from "vitest";

import {
  firstVisibleOwnerSettingsSection,
  visibleOwnerSettingsGroups,
  type OwnerSettingsAccess,
} from "./owner-settings-model";

const PROFILE_ONLY: OwnerSettingsAccess = {
  "community.profile.write": true,
  "community.namespace.write": false,
  "community.names.manage": false,
  "community.rules.write": false,
  "community.links.write": false,
  "community.membership_requests.decide": false,
  "community.moderation.manage": false,
  "community.archive.write": false,
};

describe("owner settings model", () => {
  it("removes inaccessible items and empty groups", () => {
    expect(visibleOwnerSettingsGroups(PROFILE_ONLY)).toEqual([
      {
        label: "Community",
        items: [
          {
            section: "profile",
            capability: "community.profile.write",
            label: "Profile",
            description: "Name, description and artwork",
          },
        ],
      },
    ]);
    expect(firstVisibleOwnerSettingsSection(PROFILE_ONLY)).toBe("profile");
  });
});
