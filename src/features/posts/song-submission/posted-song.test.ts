import { describe, expect, test } from "vitest";

import type { SongSubmissionView } from "../media-submission/projection";
import { selectPostedSong } from "./posted-song.tsx";
import type { SongSubmissionItem } from "./song-submission-store";

const processing: SongSubmissionView = { status: "processing", submissionId: "song-1", phase: "analysis" };
const published: SongSubmissionView = { status: "published", submissionId: "song-1", postId: "post-1", postHref: "/posts/post-1" };
const item = (accountId: string, view: SongSubmissionView = processing): SongSubmissionItem => ({
  submissionId: "song-1", accountId, communityId: "community-1", title: "Midnight Waves", view, slow: false, rerunning: false,
});
const key = { accountId: "account-a", submissionId: "song-1" };

describe("selectPostedSong", () => {
  test("shows the store's entry to the account that posted it", () => {
    expect(selectPostedSong(key, "account-a", [item("account-a")], null)?.view.status).toBe("processing");
  });

  test("keeps the last report for the same account once the store lets it go", () => {
    expect(selectPostedSong(key, "account-a", [], item("account-a", published))?.view.status).toBe("published");
  });

  test("shows nothing to another account, even with a kept report", () => {
    expect(selectPostedSong(key, "account-b", [item("account-a")], item("account-a", published))).toBeNull();
    expect(selectPostedSong(key, "account-b", [item("account-b")], null)).toBeNull();
  });

  test("shows nothing once signed out", () => {
    expect(selectPostedSong(key, undefined, [], item("account-a", published))).toBeNull();
  });

  test("never stands in a kept report for another song or account", () => {
    expect(selectPostedSong(key, "account-a", [], { ...item("account-a"), submissionId: "song-2" })).toBeNull();
    expect(selectPostedSong(key, "account-a", [], item("account-b", published))).toBeNull();
  });
});
