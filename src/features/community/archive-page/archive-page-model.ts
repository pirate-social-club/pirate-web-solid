export type CommunityArchiveStatus = "active" | "archived";

export type CommunityArchiveSubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

export const archiveCopy = {
  title: "Danger zone",
  intro: "Archiving retires this community. It is reversible — you can restore it at any time.",
  effectsTitle: "What archiving does",
  effects: [
    "Hides the community from discovery and search.",
    "Returns 404 for the public community page.",
    "Blocks new posts, comments, joins, listings, live rooms, and purchases.",
    "Keeps all existing content, members, and settings intact for restore.",
  ],
  archiveAction: "Archive community",
  confirmTitle: "Archive this community?",
  confirmBody: "Members won't be able to post, join, or buy while it's archived. You can unarchive it later.",
  confirmAction: "Yes, archive",
  cancelAction: "Cancel",
  archivedTitle: "This community is archived",
  archivedBody: "It's hidden from discovery and new activity is blocked. Restore it to bring it back online.",
  unarchiveAction: "Unarchive community",
} as const;

export const isArchiveSaving = (state: CommunityArchiveSubmitState): boolean => state.kind === "saving";
