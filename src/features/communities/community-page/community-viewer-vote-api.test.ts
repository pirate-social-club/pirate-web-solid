import { describe, expect, test, vi } from "vitest";

import {
  createCommunityViewerVoteReader,
  type CommunityViewerVoteClient,
  type ViewerVote,
} from "./community-viewer-vote-api.ts";

/** The reader never calls this when a load override is supplied. */
const unusedClient: CommunityViewerVoteClient = {
  get_postsPostId: async () => { throw new Error("the load override answers every read"); },
};

function deferred<T>() {
  let settle: (value: T) => void = () => {};
  let fail: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

describe("community viewer vote reader", () => {
  test("reports a vote as unknown until its read settles", async () => {
    const pending = deferred<ViewerVote>();
    const settled: Array<[string, ViewerVote]> = [];
    const reader = createCommunityViewerVoteReader({
      client: unusedClient,
      load: async () => pending.promise,
      onSettled: (postId, vote) => settled.push([postId, vote]),
    });

    expect(reader.read("post-1")).toBeUndefined();
    pending.settle(1);
    await vi.waitFor(() => expect(settled).toEqual([["post-1", 1]]));
    expect(reader.read("post-1")).toBe(1);
  });

  test("reads each post once however often it is asked", async () => {
    const load = vi.fn(async () => null);
    const reader = createCommunityViewerVoteReader({
      client: unusedClient,
      load,
      onSettled: () => {},
    });

    reader.read("post-1");
    reader.read("post-1");
    reader.read("post-1");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  test("keeps at most four reads in flight and starts the rest as they finish", async () => {
    const pending = new Map<string, ReturnType<typeof deferred<ViewerVote>>>();
    const reader = createCommunityViewerVoteReader({
      client: unusedClient,
      load: async ({ postId }) => {
        const entry = deferred<ViewerVote>();
        pending.set(postId, entry);
        return entry.promise;
      },
      onSettled: () => {},
    });

    // A page of the feed asks for six at once; only four may be open.
    for (const id of ["a", "b", "c", "d", "e", "f"]) reader.read(id);
    await vi.waitFor(() => expect(pending.size).toBe(4));
    expect([...pending.keys()]).toEqual(["a", "b", "c", "d"]);

    pending.get("a")?.settle(1);
    await vi.waitFor(() => expect(pending.size).toBe(5));
    expect(pending.has("e")).toBe(true);
  });

  test("treats a failed read as no vote so the viewer can still act", async () => {
    const settled: Array<[string, ViewerVote]> = [];
    const reader = createCommunityViewerVoteReader({
      client: unusedClient,
      load: async () => { throw new Error("read failed"); },
      onSettled: (postId, vote) => settled.push([postId, vote]),
    });

    reader.read("post-1");
    // Withholding the control instead would deny an action the account is
    // entitled to take; the cost is an existing vote reading as unselected.
    await vi.waitFor(() => expect(settled).toEqual([["post-1", null]]));
    expect(reader.read("post-1")).toBeNull();
  });
});
