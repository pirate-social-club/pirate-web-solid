import type {
  CommunityProfileDraft,
  CommunityProfileSettingsPort,
} from "./owner-settings-model";

export function createFakeProfileSettingsPort(initial: CommunityProfileDraft): CommunityProfileSettingsPort {
  let revision = 7;
  let profile = initial;
  return {
    read: async () => ({ community_id: "community_fixture", revision, profile }),
    save: async (command) => {
      if (command.expected_revision !== revision) throw new Error("profile_revision_conflict");
      revision += 1;
      profile = command.profile;
      return { community_id: "community_fixture", revision, profile };
    },
  };
}
