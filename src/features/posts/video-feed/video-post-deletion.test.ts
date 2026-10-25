import { afterEach, expect, test, vi } from "vitest";
import { deleteVideoPost, removeVideoPost } from "./video-post-deletion.ts";

const receipt = { object: "video_post_deletion", community_id: "community", post_id: "video-post", status: "deleted" } as const;
const target = { postId: "video-post" };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("a lost reply retries the original immutable Post without browser storage", async () => {
  const storage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("site data blocked"); });
  const remove = vi.fn().mockRejectedValueOnce(new Error("reply lost")).mockResolvedValue(receipt);
  const input = { ...target, remove, isCurrent: () => true };
  expect(await removeVideoPost(input)).toEqual({ kind: "unconfirmed" });
  expect(await removeVideoPost(input)).toEqual({ kind: "deleted" });
  expect(remove.mock.calls).toEqual([["video-post"], ["video-post"]]);
  expect(storage).not.toHaveBeenCalled();
});

test("stale authority prevents dispatch and an account change fences an in-flight reply", async () => {
  let current = false;
  const remove = vi.fn(async () => receipt);
  const input = { ...target, remove, isCurrent: () => current };
  expect(await removeVideoPost(input)).toEqual({ kind: "superseded" });
  expect(remove).not.toHaveBeenCalled();
  current = true;
  remove.mockImplementationOnce(async () => { current = false; return receipt; });
  expect(await removeVideoPost(input)).toEqual({ kind: "superseded" });
  expect(remove).toHaveBeenCalledOnce();
});

test("a receipt for another Post never acknowledges this deletion", async () => {
  expect(await removeVideoPost({ ...target,
    remove: async () => ({ ...receipt, post_id: "another-video" }), isCurrent: () => true,
  })).toEqual({ kind: "unconfirmed" });
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
