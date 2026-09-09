import { describe, expect, test, vi } from "vitest";

import {
  createCommunityViewerVoteReader,
  type CommunityViewerVoteClient,
  type ViewerVote,
  type ViewerVoteRead,
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
  test("discarding an account reader cancels queued reads and ignores in-flight results", async () => {
    const pending=deferred<ViewerVote>();
    const onSettled=vi.fn();
    const load=vi.fn(()=>pending.promise);
    const reader=createCommunityViewerVoteReader({client:unusedClient,load,onSettled});
    for(let index=0;index<6;index++) reader.read(`post-${index}`);
    expect(load).toHaveBeenCalledTimes(4);
    reader.dispose();pending.settle(1);
    await pending.promise;await Promise.resolve();await Promise.resolve();
    expect(onSettled).not.toHaveBeenCalled();expect(load).toHaveBeenCalledTimes(4);
    expect(reader.read("post-0")).toBeUndefined();
  });

  test("reports a vote as unknown until its read settles", async () => {
    const pending = deferred<ViewerVote>();
    const settled: Array<[string, ViewerVoteRead]> = [];
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

  test("keeps a failure unknown and recovers the existing vote only after explicit retry", async () => {
    const settled: Array<[string, ViewerVoteRead]> = [];
    const load = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(1);
    const reader = createCommunityViewerVoteReader({
      client: unusedClient,
      load,
      onSettled: (postId, vote) => settled.push([postId, vote]),
    });
    reader.read("post-1");
    await vi.waitFor(() => expect(settled).toEqual([["post-1", "unavailable"]]));
    expect(reader.read("post-1")).toBe("unavailable");
    expect(load).toHaveBeenCalledTimes(1);
    reader.retry("post-1");
    expect(reader.read("post-1")).toBeUndefined();
    await vi.waitFor(() => expect(reader.read("post-1")).toBe(1));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
