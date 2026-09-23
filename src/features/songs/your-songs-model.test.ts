import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import type { ApplicationSessionState } from "../shell/application-session.tsx";
import { createYourSongs, type SongLibrarySource } from "./your-songs-model.ts";

const disposals: (() => void)[] = [];
afterEach(() => disposals.splice(0).forEach(dispose => dispose()));
const song = (id: string) => ({ id, title: id, artist: "Harbor" });

test("a late persona response cannot overwrite a new persona or survive sign-out", async () => {
  const pending = new Map<string, (result: Awaited<ReturnType<SongLibrarySource["list"]>>) => void>();
  const [account, setAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account" });
  const [persona, setPersona] = createSignal("harbor");
  const list = vi.fn<SongLibrarySource["list"]>(id => new Promise(resolve => pending.set(id, resolve)));
  const model = createRoot(dispose => { disposals.push(dispose); return createYourSongs(account, persona, { list, trending: async () => [] }); });
  await vi.waitFor(() => expect(pending.has("harbor")).toBe(true));
  setPersona("night");
  await vi.waitFor(() => expect(pending.has("night")).toBe(true));
  pending.get("night")!({ songs: [song("night-song")], nextCursor: null });
  await vi.waitFor(() => expect(model.songs()).toEqual([song("night-song")]));
  pending.get("harbor")!({ songs: [song("private-harbor-song")], nextCursor: null });
  await Promise.resolve();
  expect(model.songs()).toEqual([song("night-song")]);
  setAccount("anonymous");
  await vi.waitFor(() => expect(model.songs()).toEqual([]));
  await vi.waitFor(() => expect(model.hasMore()).toBe(false));
});

test("pagination keeps history on failure, retries the same cursor and deduplicates songs", async () => {
  const list = vi.fn<SongLibrarySource["list"]>()
    .mockResolvedValueOnce({ songs: [song("first")], nextCursor: "page-2" })
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ songs: [song("first"), song("second")], nextCursor: null });
  const model = createRoot(dispose => { disposals.push(dispose); return createYourSongs(() => ({ status: "authenticated", userId: "account" }), () => "harbor", { list, trending: async () => [] }); });
  await vi.waitFor(() => expect(model.songs()).toHaveLength(1));
  model.loadMore();
  await vi.waitFor(() => expect(model.failed()).toBe(true));
  expect(model.songs()).toHaveLength(1);
  model.loadMore();
  await vi.waitFor(() => expect(model.songs()).toHaveLength(2));
  expect(list).toHaveBeenLastCalledWith("harbor", "page-2");
  expect(model.hasMore()).toBe(false);
});
