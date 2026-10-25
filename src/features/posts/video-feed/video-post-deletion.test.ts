import { afterEach, expect, test, vi } from "vitest";
import { deleteVideoPost, removeVideoPost, type VideoDeletionStorage } from "./video-post-deletion.ts";

const receipt = { object: "video_post_deletion", community_id: "community", post_id: "video-post", status: "deleted" } as const;
const target = { accountId: "author_account", postId: "video-post" };
function fixture() {
  const values = new Map<string, string>();
  const storage: VideoDeletionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  return { values, storage };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("a lost reply retains only the original account/Post intent and retries that target", async () => {
  const { storage, values } = fixture();
  const remove = vi.fn().mockRejectedValueOnce(new Error("reply lost")).mockResolvedValue(receipt);
  const input = { ...target, storage: () => storage, remove, isCurrent: () => true };
  expect(await removeVideoPost(input)).toEqual({ kind: "unconfirmed" });
  expect([...values.values()].map(value => JSON.parse(value))).toEqual([{ version: 1, ...target }]);
  expect(await removeVideoPost(input)).toEqual({ kind: "deleted" });
  expect(remove.mock.calls).toEqual([["video-post"], ["video-post"]]);
  expect(values.size).toBe(0);
});

test.each(["throws", "drops", "foreign-intent"])("storage that %s prevents dispatch", async kind => {
  const { storage } = fixture();
  const remove = vi.fn(async () => receipt);
  const broken: VideoDeletionStorage = { ...storage,
    getItem: kind === "foreign-intent" ? () => '{"accountId":"another_account"}' : storage.getItem,
    setItem: () => { if (kind === "throws") throw new Error("storage full"); },
  };
  expect(await removeVideoPost({ ...target, storage: () => broken, remove, isCurrent: () => true })).toEqual({ kind: "storage_failed" });
  expect(remove).not.toHaveBeenCalled();
});

test("account changes while saving prevent dispatch; changes after sending retain the original intent", async () => {
  const { storage, values } = fixture();
  let current = true;
  const remove = vi.fn(async () => receipt);
  const saving = { ...storage, setItem: (key: string, value: string) => { storage.setItem(key, value); current = false; } };
  expect(await removeVideoPost({ ...target, storage: () => saving, remove, isCurrent: () => current })).toEqual({ kind: "superseded" });
  expect(remove).not.toHaveBeenCalled();
  current = true;
  remove.mockImplementationOnce(async () => { current = false; return receipt; });
  expect(await removeVideoPost({ ...target, storage: () => storage, remove, isCurrent: () => current })).toEqual({ kind: "superseded" });
  expect(values.size).toBe(1);
});

test("a receipt for another Post never acknowledges this deletion", async () => {
  const { storage, values } = fixture();
  expect(await removeVideoPost({ ...target, storage: () => storage,
    remove: async () => ({ ...receipt, post_id: "another-video" }), isCurrent: () => true,
  })).toEqual({ kind: "unconfirmed" });
  expect(values.size).toBe(1);
});

test("local cleanup failure cannot undo a definitive server acknowledgment", async () => {
  const { storage, values } = fixture();
  expect(await removeVideoPost({ ...target,
    storage: () => ({ ...storage, removeItem: () => { throw new Error("storage unavailable"); } }),
    remove: async () => receipt, isCurrent: () => true,
  })).toEqual({ kind: "deleted" });
  expect(values.size).toBe(1);
});

test("the genuine DELETE client uses same-origin session and current CSRF without an actor body", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-fixture");
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(receipt));
  vi.stubGlobal("fetch", transport);
  expect(await deleteVideoPost("video-post")).toEqual(receipt);
  const call = transport.mock.calls[0];
  if (!call || !(call[0] instanceof URL) || !call[1]) throw new Error("Expected a generated session fetch");
  const [url, init] = call;
  expect(url.origin).toBe(location.origin);
  expect(url.pathname).toBe("/api/posts/video-post/video");
  expect(init.method).toBe("DELETE");
  expect(init.credentials).toBe("same-origin");
  expect(new Headers(init.headers).get("x-csrf-token")).toBe("csrf-fixture");
  expect(new Headers(init.headers).has("authorization")).toBe(false);
  expect(init.body).toBeUndefined();
});
