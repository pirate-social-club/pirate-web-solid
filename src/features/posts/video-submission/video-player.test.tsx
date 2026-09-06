/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { VideoPlayer } from "./video-player";
const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { for (const d of disposers.splice(0)) d(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });
function mount(mint: NonNullable<Parameters<typeof VideoPlayer>[0]["mint"]>) {
  const root = document.createElement("div"); document.body.appendChild(root);
  createRoot(dispose => { disposers.push(dispose); render(() => <VideoPlayer postId="post" state={{ playback: "ready", thumbnail: "ready" }} mint={mint} attach={async input => { if (!input.signal.aborted) input.video.src = input.url; return () => {}; }} />, root); });
  return root;
}
const grant = () => ({ url: "https://customer-fixture.cloudflarestream.com/a.b.c/manifest/video.m3u8", expiresAt: Date.now() + 300_000, renewAt: Date.now() + 240_000 });
async function flush() { await vi.advanceTimersByTimeAsync(1); }
test("mints on viewing, uses authorized poster and renews through the same endpoint", async () => {
  const mint = vi.fn().mockImplementation(async () => grant()); const root = mount(mint); await flush();
  expect(mint).toHaveBeenCalledTimes(1); expect(root.querySelector("video")?.src).toContain("/a.b.c/manifest/");
  expect(root.querySelector("video")?.poster).toContain("/api/posts/post/video/poster");
  await vi.advanceTimersByTimeAsync(240_000); expect(mint).toHaveBeenCalledTimes(2);
});
test("denied renewal removes buffered source and does not automatically mint again", async () => {
  const mint = vi.fn().mockResolvedValueOnce(grant()).mockRejectedValue(new Error("denied")); const root = mount(mint); await flush();
  await vi.advanceTimersByTimeAsync(240_000); expect(root.querySelector("video")?.getAttribute("src")).toBeNull();
  expect(root.textContent).toContain("Playback is unavailable"); await vi.advanceTimersByTimeAsync(600_000); expect(mint).toHaveBeenCalledTimes(2);
});
test("hanging renewal cannot extend access past the old expiry", async () => {
  const mint = vi.fn().mockResolvedValueOnce(grant()).mockImplementation(() => new Promise(() => {})); const root = mount(mint); await flush();
  await vi.advanceTimersByTimeAsync(300_000); expect(root.querySelector("video")?.getAttribute("src")).toBeNull(); expect(root.textContent).toContain("Playback is unavailable");
});
test("unmount rejects late access and aborts the request", async () => {
  let complete!: (value: ReturnType<typeof grant>) => void; let signal!: AbortSignal;
  const root = mount(async (_post, current) => { signal = current; return new Promise(resolve => { complete = resolve; }); }); await flush();
  disposers.pop()!(); expect(signal.aborted).toBe(true); complete(grant()); await flush();
  expect(root.querySelector("video")?.getAttribute("src")).toBeNull();
});

test("loads a late authorized thumbnail independently of pending playback", async () => {
  const root = document.createElement("div"); document.body.appendChild(root);
  let ready!: () => void;
  const mint = vi.fn();
  createRoot(dispose => {
    disposers.push(dispose);
    const [thumbnail, setThumbnail] = createSignal<"pending" | "ready">("pending", { ownedWrite: true });
    ready = () => setThumbnail("ready");
    render(() => <VideoPlayer postId="post" state={{ playback: "pending", thumbnail: thumbnail() }} mint={mint} />, root);
  });
  await flush(); expect(root.querySelector("img")).toBeNull();
  ready(); await flush();
  expect(root.querySelector("img")?.getAttribute("src")).toBe("/api/posts/post/video/poster");
  expect(mint).not.toHaveBeenCalled();
});
